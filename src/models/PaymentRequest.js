const mongoose = require('mongoose');

const paymentRequestSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled', 'created', 'failed', 'refunded'],
    default: 'pending',
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'cash', 'credit_card', 'debit_card', 'offline', 'online', 'razorpay'],
    default: 'bank_transfer'
  },
  // Razorpay specific fields
  orderId: {
    type: String,
    sparse: true,
    unique: true
  },
  paymentId: {
    type: String,
    sparse: true
  },
  signature: String,
  
  // Type of payment
  type: {
    type: String,
    enum: ['booking', 'subscription', 'renewal', 'offline'],
    default: 'subscription'
  },
  
  // User who made the payment
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Related subscription
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  
  // Related booking
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  
  // Account details for bank transfers
  accountDetails: {
    accountHolderName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode: { type: String, trim: true, uppercase: true },
    bankName: { type: String, trim: true },
    upiId: { type: String, trim: true, lowercase: true },
    branch: { type: String, trim: true },
    accountType: { type: String, enum: ['savings', 'current'], default: 'savings' }
  },
  
  // Additional info
  description: { type: String, trim: true },
  adminNotes: { type: String, trim: true },
  transactionId: { type: String, trim: true, sparse: true },
  transactionReference: { type: String, trim: true },
  
  // Metadata for flexible data storage
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Processing info
  processedAt: Date,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String, trim: true },
  
  // Approval info (for offline payments)
  approvedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Refund info
  refundReason: String,
  refundRequestedAt: Date,
  refundProcessedAt: Date,
  refundProcessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Timestamps
  requestedAt: { type: Date, default: Date.now, index: true },
  completedAt: Date,
  capturedAt: Date,
  failedAt: Date
}, { timestamps: true });

// Indexes
paymentRequestSchema.index({ doctorId: 1, status: 1 });
paymentRequestSchema.index({ requestedAt: -1 });
paymentRequestSchema.index({ status: 1, requestedAt: -1 });
paymentRequestSchema.index({ orderId: 1 });
paymentRequestSchema.index({ paymentId: 1 });
paymentRequestSchema.index({ userId: 1 });
paymentRequestSchema.index({ type: 1 });

// Virtual for formatted amount
paymentRequestSchema.virtual('formattedAmount').get(function() {
  return `₹${this.amount.toFixed(2)}`;
});

// Method to approve payment
paymentRequestSchema.methods.approve = async function(adminId, transactionRef) {
  this.status = 'approved';
  this.processedBy = adminId;
  this.processedAt = new Date();
  if (transactionRef) this.transactionReference = transactionRef;
  await this.save();
};

// Method to complete payment
paymentRequestSchema.methods.complete = async function(adminId, transactionId) {
  this.status = 'completed';
  this.processedBy = adminId;
  this.processedAt = new Date();
  this.completedAt = new Date();
  if (transactionId) this.transactionId = transactionId;
  await this.save();
};

// Method to reject payment
paymentRequestSchema.methods.reject = async function(adminId, reason) {
  this.status = 'rejected';
  this.processedBy = adminId;
  this.processedAt = new Date();
  this.rejectionReason = reason;
  await this.save();
};

// Method to mark as failed
paymentRequestSchema.methods.fail = async function(errorCode, errorDescription) {
  this.status = 'failed';
  this.errorCode = errorCode;
  this.errorDescription = errorDescription;
  this.failedAt = new Date();
  await this.save();
};

module.exports = mongoose.model('PaymentRequest', paymentRequestSchema);