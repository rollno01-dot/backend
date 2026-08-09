// controllers/payment.controller.js
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const Subscription = require('../models/Subscription');
const Payment = require('../models/PaymentRequest');
const Doctor = require('../models/Doctor');
const User = require('../models/User');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ============= PUBLIC ROUTES =============

/**
 * Verify payment after successful transaction
 */
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId,
      type
    } = req.body;

    console.log('🔍 Verifying payment:', { razorpay_order_id, razorpay_payment_id, type });

    // Generate signature for verification
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    // Verify signature
    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      console.error('❌ Invalid payment signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Find or create payment record
    let payment = await Payment.findOne({ orderId: razorpay_order_id });
    
    if (!payment) {
      payment = new Payment({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        type: type || 'booking',
        status: 'completed',
        bookingId: bookingId
      });
    } else {
      payment.paymentId = razorpay_payment_id;
      payment.signature = razorpay_signature;
      payment.status = 'completed';
    }

    await payment.save();

    // Update related record based on type
    if (type === 'booking' && bookingId) {
      await Booking.findByIdAndUpdate(bookingId, {
        paymentStatus: 'completed',
        paymentId: payment._id,
        status: 'confirmed'
      });
    } else if (type === 'subscription') {
      // Update doctor's subscription
      const doctorId = req.body.doctorId;
      await Doctor.findByIdAndUpdate(doctorId, {
        subscription: true,
        subscriptionId: payment._id
      });
      
      // Create or update subscription record
      await Subscription.findOneAndUpdate(
        { doctorId },
        {
          doctorId,
          paymentId: payment._id,
          status: 'active',
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        },
        { upsert: true, new: true }
      );
    }

    console.log('✅ Payment verified successfully:', razorpay_payment_id);

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        type
      }
    });
  } catch (error) {
    console.error('❌ Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};

/**
 * Handle payment gateway webhook
 */
exports.handleWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const { event, payload } = req.body;

    console.log('📦 Webhook received:', event);

    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload);
        break;
      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;
      case 'subscription.charged':
        await handleSubscriptionCharged(payload);
        break;
      default:
        console.log('Unhandled webhook event:', event);
    }

    res.json({ success: true, received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Handle payment callback
 */
exports.handleCallback = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Redirect to frontend with payment details
    const redirectUrl = `${process.env.FRONTEND_URL}/payment/callback?order_id=${razorpay_order_id}&payment_id=${razorpay_payment_id}&signature=${razorpay_signature}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/payment/failed`);
  }
};

/**
 * Get public payment status
 */
exports.getPublicPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const payment = await Payment.findOne({ orderId });
    
    if (!payment) {
      return res.json({
        success: true,
        data: { status: 'pending' }
      });
    }
    
    res.json({
      success: true,
      data: {
        status: payment.status,
        paymentId: payment.paymentId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============= OFFLINE PAYMENT ROUTES =============

/**
 * Submit offline payment request (from mobile app)
 */
exports.submitOfflinePayment = async (req, res) => {
  try {
    const { doctorId, doctorName, amount, plan, paymentMethod, notes } = req.body;

    console.log('📝 Offline payment request received:', { doctorId, amount, plan });

    // Validate required fields
    if (!doctorId || !amount || !plan) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: doctorId, amount, plan'
      });
    }

    // Calculate expiry date based on plan
    const expiryDate = new Date();
    if (plan === 'monthly') {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    } else if (plan === 'quarterly') {
      expiryDate.setMonth(expiryDate.getMonth() + 3);
    } else if (plan === 'yearly') {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    }

    // Create payment record with pending status
    const payment = new Payment({
      doctorId,
      amount,
      currency: 'INR',
      status: 'pending',
      type: 'subscription',
      paymentMethod: 'offline',
      transactionId: `OFFLINE_${Date.now()}`,
      metadata: {
        plan,
        doctorName,
        notes: notes || 'Offline payment request',
        submittedAt: new Date()
      }
    });

    await payment.save();

    // Create pending subscription
    let subscription = await Subscription.findOne({ doctorId });
    
    if (subscription) {
      subscription.paymentStatus = 'pending';
      subscription.status = 'pending';
      subscription.planType = plan;
      subscription.price = amount;
      subscription.endDate = expiryDate;
      subscription.paymentMethod = 'offline';
      subscription.notes = notes || 'Awaiting offline payment approval';
      subscription.updatedAt = new Date();
    } else {
      subscription = new Subscription({
        doctorId,
        planType: plan,
        price: amount,
        currency: 'INR',
        duration: plan === 'monthly' ? 1 : plan === 'quarterly' ? 3 : 12,
        durationUnit: 'months',
        startDate: new Date(),
        endDate: expiryDate,
        paymentStatus: 'pending',
        paymentMethod: 'offline',
        status: 'pending',
        transactionId: `OFFLINE_${Date.now()}`,
        notes: notes || 'Awaiting offline payment approval',
        autoRenew: false,
        features: {
          videoConsultations: true,
          prioritySupport: plan !== 'monthly',
          advancedAnalytics: plan === 'yearly',
          patientManagement: true,
          appointmentReminders: true,
          customBranding: plan === 'yearly',
          multipleLocations: plan === 'yearly',
          staffAccounts: plan === 'yearly' ? 5 : plan === 'quarterly' ? 2 : 0
        }
      });
    }

    await subscription.save();

    console.log('✅ Offline payment request saved:', { paymentId: payment._id, subscriptionId: subscription._id });

    res.json({
      success: true,
      message: 'Offline payment request submitted successfully',
      data: {
        paymentId: payment._id,
        subscriptionId: subscription._id,
        status: 'pending',
        amount,
        plan
      }
    });
  } catch (error) {
    console.error('❌ Error submitting offline payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit offline payment request',
      error: error.message
    });
  }
};

/**
 * Approve offline payment (admin only)
 */
exports.approveOfflinePayment = async (req, res) => {
  try {
    const {
      subscriptionId,
      doctorId,
      amount,
      transactionId,
      notes
    } = req.body;

    console.log('💰 Approving offline payment:', { subscriptionId, doctorId, transactionId });

    // Find and update payment
    let payment;
    if (subscriptionId) {
      payment = await Payment.findOne({ subscriptionId });
    } else {
      payment = await Payment.findOne({ doctorId, status: 'pending', paymentMethod: 'offline' });
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Pending payment not found'
      });
    }

    payment.status = 'completed';
    payment.transactionId = transactionId || payment.transactionId;
    payment.approvedAt = new Date();
    payment.approvedBy = req.user?.id;
    payment.notes = notes || payment.notes;
    await payment.save();

    // Find and update subscription
    let subscription;
    if (subscriptionId) {
      subscription = await Subscription.findById(subscriptionId);
    } else {
      subscription = await Subscription.findOne({ doctorId, status: 'pending' });
    }

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Pending subscription not found'
      });
    }

    subscription.paymentStatus = 'completed';
    subscription.status = 'active';
    subscription.transactionId = transactionId || subscription.transactionId;
    subscription.approvedAt = new Date();
    subscription.approvedBy = req.user?.id;
    subscription.notes = notes || subscription.notes;
    await subscription.save();

    // Update doctor's subscription status
    await User.findByIdAndUpdate(doctorId, {
      subscription: true,
      subscriptionPlan: subscription.planType,
      subscriptionEndDate: subscription.endDate,
      subscriptionStatus: 'active'
    });

    await Doctor.findOneAndUpdate(
      { userId: doctorId },
      {
        subscription: true,
        subscriptionPlan: subscription.planType,
        subscriptionEndDate: subscription.endDate
      }
    );

    console.log('✅ Offline payment approved for doctor:', doctorId);

    res.json({
      success: true,
      message: 'Offline payment approved successfully',
      data: {
        paymentId: payment._id,
        subscriptionId: subscription._id,
        doctorId,
        status: 'active',
        validUntil: subscription.endDate
      }
    });
  } catch (error) {
    console.error('❌ Error approving offline payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve offline payment',
      error: error.message
    });
  }
};

/**
 * Get pending offline payments (admin only)
 */
exports.getPendingOfflinePayments = async (req, res) => {
  try {
    const payments = await Payment.find({
      status: 'pending',
      paymentMethod: 'offline',
      type: 'subscription'
    })
    .populate('doctorId', 'fullName email phoneNumber')
    .sort({ createdAt: -1 });

    const subscriptions = await Subscription.find({
      status: 'pending',
      paymentMethod: 'offline'
    })
    .populate('doctorId', 'fullName email phoneNumber')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        payments,
        subscriptions
      }
    });
  } catch (error) {
    console.error('❌ Error fetching pending payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending payments',
      error: error.message
    });
  }
};

// ============= SUBSCRIPTION ACTIVATION =============

/**
 * Activate subscription after payment (new endpoint for mobile app)
 */
exports.activateSubscription = async (req, res) => {
  try {
    const { doctorId, plan, amount, transactionId, expiryDate } = req.body;

    console.log('📝 Activating subscription:', { doctorId, plan, amount, transactionId });

    // Validate required fields
    if (!doctorId || !plan || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: doctorId, plan, amount'
      });
    }

    // Calculate duration based on plan
    let duration = 1;
    let durationUnit = 'months';
    
    if (plan === 'monthly') {
      duration = 1;
    } else if (plan === 'quarterly') {
      duration = 3;
    } else if (plan === 'yearly') {
      duration = 1;
      durationUnit = 'years';
    }

    // Set features based on plan
    const features = {
      videoConsultations: true,
      prioritySupport: plan !== 'monthly',
      advancedAnalytics: plan === 'yearly',
      patientManagement: true,
      appointmentReminders: true,
      customBranding: plan === 'yearly',
      multipleLocations: plan === 'yearly',
      staffAccounts: plan === 'yearly' ? 5 : plan === 'quarterly' ? 2 : 0
    };

    // Create payment record
    const payment = new Payment({
      doctorId,
      amount,
      currency: 'INR',
      status: 'completed',
      type: 'subscription',
      paymentMethod: 'online',
      transactionId: transactionId || `ONLINE_${Date.now()}`,
      metadata: {
        plan,
        activatedAt: new Date()
      }
    });
    await payment.save();

    // Find or create subscription
    let subscription = await Subscription.findOne({ doctorId });
    
    if (subscription) {
      // Update existing subscription
      subscription.planType = plan;
      subscription.price = amount;
      subscription.currency = 'INR';
      subscription.duration = duration;
      subscription.durationUnit = durationUnit;
      subscription.startDate = new Date();
      subscription.endDate = expiryDate ? new Date(expiryDate) : new Date(Date.now() + duration * 30 * 24 * 60 * 60 * 1000);
      subscription.paymentStatus = 'completed';
      subscription.paymentMethod = 'online';
      subscription.status = 'active';
      subscription.transactionId = transactionId;
      subscription.features = features;
      subscription.updatedAt = new Date();
    } else {
      // Create new subscription
      subscription = new Subscription({
        doctorId,
        planType: plan,
        price: amount,
        currency: 'INR',
        duration: duration,
        durationUnit: durationUnit,
        startDate: new Date(),
        endDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + duration * 30 * 24 * 60 * 60 * 1000),
        paymentStatus: 'completed',
        paymentMethod: 'online',
        status: 'active',
        transactionId: transactionId,
        features: features,
        autoRenew: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    await subscription.save();

    // Update doctor's subscription status
    await User.findByIdAndUpdate(doctorId, {
      subscription: true,
      subscriptionPlan: plan,
      subscriptionEndDate: subscription.endDate
    });

    await Doctor.findOneAndUpdate(
      { userId: doctorId },
      {
        subscription: true,
        subscriptionPlan: plan,
        subscriptionEndDate: subscription.endDate
      }
    );

    console.log('✅ Subscription activated successfully for doctor:', doctorId);

    res.json({
      success: true,
      message: 'Subscription activated successfully',
      data: {
        subscriptionId: subscription._id,
        paymentId: payment._id,
        plan,
        amount,
        validUntil: subscription.endDate,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('❌ Error activating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate subscription',
      error: error.message
    });
  }
};

// ============= PROTECTED ROUTES =============

/**
 * Create order for booking payment
 */
exports.createBookingOrder = async (req, res) => {
  try {
    const { amount, bookingId, currency = 'INR' } = req.body;

    if (!amount || !bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Amount and bookingId are required'
      });
    }

    const options = {
      amount: amount * 100, // Razorpay expects amount in paise
      currency,
      receipt: `booking_${bookingId}`,
      notes: {
        bookingId,
        userId: req.user.id,
        type: 'booking'
      }
    };

    const order = await razorpay.orders.create(options);

    // Save payment record
    const payment = new Payment({
      orderId: order.id,
      amount: amount,
      currency,
      status: 'created',
      type: 'booking',
      bookingId,
      userId: req.user.id
    });

    await payment.save();

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Create booking order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
};

/**
 * Get booking payment status
 */
exports.getBookingPaymentStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const payment = await Payment.findOne({ bookingId }).sort({ createdAt: -1 });

    if (!payment) {
      return res.json({
        success: true,
        data: { status: 'pending', paymentRequired: true }
      });
    }

    res.json({
      success: true,
      data: {
        status: payment.status,
        paymentId: payment.paymentId,
        amount: payment.amount,
        createdAt: payment.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create order for subscription payment
 */
exports.createSubscriptionOrder = async (req, res) => {
  try {
    const { plan, amount, duration } = req.body;

    if (!plan || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Plan and amount are required'
      });
    }

    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `subscription_${req.user.id}`,
      notes: {
        userId: req.user.id,
        doctorId: req.user.doctorId,
        plan,
        duration,
        type: 'subscription'
      }
    };

    const order = await razorpay.orders.create(options);

    // Save payment record
    const payment = new Payment({
      orderId: order.id,
      amount: amount,
      currency: 'INR',
      status: 'created',
      type: 'subscription',
      userId: req.user.id,
      doctorId: req.user.doctorId
    });

    await payment.save();

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Create subscription order error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get subscription status
 */
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const doctorId = req.user.doctorId || req.user.id;

    const subscription = await Subscription.findOne({ doctorId }).sort({ createdAt: -1 });

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          isActive: false,
          status: 'inactive',
          plan: 'free',
          expiryDate: null,
          startDate: null
        }
      });
    }

    const isActive = subscription.status === 'active' && subscription.endDate > new Date();

    res.json({
      success: true,
      data: {
        isActive,
        status: subscription.status,
        plan: subscription.planType,
        expiryDate: subscription.endDate,
        startDate: subscription.startDate,
        paymentStatus: subscription.paymentStatus
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Renew subscription
 */
exports.renewSubscription = async (req, res) => {
  try {
    const { amount, plan } = req.body;
    const doctorId = req.user.doctorId || req.user.id;

    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `renewal_${doctorId}`,
      notes: {
        doctorId,
        plan,
        type: 'renewal'
      }
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Cancel subscription
 */
exports.cancelSubscription = async (req, res) => {
  try {
    const doctorId = req.user.doctorId || req.user.id;

    await Subscription.findOneAndUpdate(
      { doctorId, status: 'active' },
      { status: 'cancelled' }
    );

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get payment history
 */
exports.getPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;
    const query = { userId: req.user.id };
    
    if (type) query.type = type;

    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('bookingId', 'doctorName date time');

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get payment receipt
 */
exports.getPaymentReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId)
      .populate('userId', 'name email phoneNumber')
      .populate('bookingId');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if user owns this payment
    if (payment.userId?.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to view this payment'
      });
    }

    res.json({
      success: true,
      data: {
        receipt: {
          id: payment._id,
          orderId: payment.orderId,
          paymentId: payment.paymentId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          type: payment.type,
          createdAt: payment.createdAt,
          user: payment.userId,
          booking: payment.bookingId
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get available payment methods
 */
exports.getAvailablePaymentMethods = async (req, res) => {
  try {
    res.json({
      success: true,
      data: [
        { id: 'card', name: 'Credit/Debit Card', enabled: true },
        { id: 'upi', name: 'UPI', enabled: true },
        { id: 'netbanking', name: 'Net Banking', enabled: true },
        { id: 'wallet', name: 'Wallet', enabled: true },
        { id: 'offline', name: 'Cash/Offline', enabled: true }
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Request refund
 */
exports.requestRefund = async (req, res) => {
  try {
    const { paymentId, reason } = req.body;

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if payment is eligible for refund
    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Payment is not eligible for refund'
      });
    }

    // Process refund (this would integrate with Razorpay refund API)
    payment.status = 'refunded';
    payment.refundReason = reason;
    payment.refundRequestedAt = new Date();
    await payment.save();

    res.json({
      success: true,
      message: 'Refund requested successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============= ADMIN ONLY ROUTES =============

/**
 * Get all payments (admin only)
 */
exports.getAllPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (type) query.type = type;

    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'fullName email phoneNumber')
      .populate('doctorId', 'fullName email')
      .populate('approvedBy', 'fullName email');

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get payment statistics (admin only)
 */
exports.getPaymentStats = async (req, res) => {
  try {
    const totalPayments = await Payment.countDocuments();
    const completedPayments = await Payment.countDocuments({ status: 'completed' });
    const pendingPayments = await Payment.countDocuments({ status: 'pending' });
    const failedPayments = await Payment.countDocuments({ status: 'failed' });
    
    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const monthlyRevenue = await Payment.aggregate([
      { 
        $match: { 
          status: 'completed',
          createdAt: { 
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) 
          } 
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      data: {
        total: totalPayments,
        completed: completedPayments,
        pending: pendingPayments,
        failed: failedPayments,
        totalRevenue: totalRevenue[0]?.total || 0,
        monthlyRevenue: monthlyRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Process refund (admin only)
 */
exports.processRefund = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    payment.status = 'refunded';
    payment.refundReason = reason;
    payment.refundProcessedAt = new Date();
    payment.refundProcessedBy = req.user.id;
    await payment.save();

    res.json({
      success: true,
      message: 'Refund processed successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============= OPTIONAL AUTH ROUTES =============

/**
 * Create order for guest user
 */
exports.createGuestOrder = async (req, res) => {
  try {
    const { amount, bookingId, currency = 'INR' } = req.body;

    const options = {
      amount: amount * 100,
      currency,
      receipt: `guest_${Date.now()}`,
      notes: {
        bookingId,
        type: 'guest_booking'
      }
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get guest payment status
 */
exports.getGuestPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const payment = await Payment.findOne({ orderId });

    if (!payment) {
      return res.json({
        success: true,
        data: { status: 'pending' }
      });
    }

    res.json({
      success: true,
      data: {
        status: payment.status,
        paymentId: payment.paymentId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============= HELPER FUNCTIONS =============

async function handlePaymentCaptured(payload) {
  const { payment } = payload;
  const orderId = payment.order_id;

  await Payment.findOneAndUpdate(
    { orderId },
    {
      paymentId: payment.id,
      status: 'completed',
      capturedAt: new Date()
    }
  );
}

async function handlePaymentFailed(payload) {
  const { payment } = payload;
  const orderId = payment.order_id;

  await Payment.findOneAndUpdate(
    { orderId },
    {
      status: 'failed',
      errorCode: payment.error_code,
      errorDescription: payment.error_description,
      failedAt: new Date()
    }
  );
}

async function handleSubscriptionCharged(payload) {
  const { subscription } = payload;
  console.log('Subscription charged:', subscription.id);
}