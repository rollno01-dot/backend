const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

// ============= TEST ROUTE =============
router.get('/test', (req, res) => {
  console.log('✅ Test route hit!');
  res.json({ 
    success: true, 
    message: 'Payment routes are working!',
    timestamp: new Date().toISOString()
  });
});

// ============= OFFLINE PAYMENT ROUTES =============
// Submit offline payment request (from mobile app)
router.post(
  '/offline/submit',
  protect,
  paymentController.submitOfflinePayment
);

// Approve offline payment (admin only)
router.post(
  '/offline/approve',
  protect,
  authorize('admin'),
  paymentController.approveOfflinePayment
);

// Get pending offline payments (admin only)
router.get(
  '/offline/pending',
  protect,
  authorize('admin'),
  paymentController.getPendingOfflinePayments
);

// ============= SUBSCRIPTION ACTIVATION =============
// Activate subscription after payment
router.post(
  '/subscriptions/activate',
  protect,
  paymentController.activateSubscription
);

// ============= SUBSCRIPTION STATUS =============
// Get subscription status
router.get(
  '/subscription/status',
  protect,
  paymentController.getSubscriptionStatus
);

console.log('✅ Payment routes configured');
module.exports = router; // THIS MUST BE THE ONLY EXPORT