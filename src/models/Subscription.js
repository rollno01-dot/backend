const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  doctorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Doctor', 
    required: true
  },
  planType: { 
    type: String, 
    enum: ['free', 'basic', 'premium', 'monthly', 'quarterly', 'yearly'], // ADD monthly, quarterly, yearly
    default: 'free' 
  },
  price: { 
    type: Number, 
    min: 0
  },
  currency: { 
    type: String, 
    default: 'INR' 
  },
  duration: { 
    type: Number,
    min: 1,
    max: 365
  },
  durationUnit: {
    type: String,
    enum: ['days', 'months', 'years'],
    default: 'months'
  },
  startDate: { 
    type: Date, 
    default: Date.now 
  },
  endDate: { 
    type: Date, 
    required: true
  },
  paymentId: { 
    type: String,
    sparse: true 
  },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'refunded'], 
    default: 'pending' 
  },
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'stripe', 'paypal', 'cash', 'bank_transfer', 'free', 'online', 'offline'], // ADD offline
    default: 'free'
  },
  transactionId: String,
  invoiceNumber: String,
  autoRenew: { 
    type: Boolean, 
    default: false 
  },
  status: { 
    type: String, 
    enum: ['active', 'expired', 'cancelled', 'pending', 'suspended'], 
    default: 'pending' 
  },
  features: {
    videoConsultations: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    advancedAnalytics: { type: Boolean, default: false },
    patientManagement: { type: Boolean, default: true },
    appointmentReminders: { type: Boolean, default: true },
    customBranding: { type: Boolean, default: false },
    multipleLocations: { type: Boolean, default: false },
    staffAccounts: { type: Number, default: 0 }
  },
  // Approval fields for offline payments
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String,
  cancelledAt: Date,
  cancellationReason: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
subscriptionSchema.index({ doctorId: 1, status: 1 });
subscriptionSchema.index({ endDate: 1 });
subscriptionSchema.index({ paymentStatus: 1 });
subscriptionSchema.index({ planType: 1 });
subscriptionSchema.index({ createdAt: -1 });

// Virtual for doctor details
subscriptionSchema.virtual('doctor', {
  ref: 'Doctor',
  localField: 'doctorId',
  foreignField: '_id',
  justOne: true
});

// Update timestamps
subscriptionSchema.pre('save', function(next) { 
  this.updatedAt = Date.now(); 
  next(); 
});

// Pre-save middleware to calculate endDate if not provided
subscriptionSchema.pre('save', function(next) {
  if (!this.endDate && this.duration) {
    const startDate = this.startDate || new Date();
    const endDate = new Date(startDate);
    
    switch(this.durationUnit) {
      case 'days':
        endDate.setDate(endDate.getDate() + this.duration);
        break;
      case 'months':
        endDate.setMonth(endDate.getMonth() + this.duration);
        break;
      case 'years':
        endDate.setFullYear(endDate.getFullYear() + this.duration);
        break;
      default:
        endDate.setMonth(endDate.getMonth() + this.duration);
    }
    
    this.endDate = endDate;
  }
  next();
});

// Post-save middleware to update doctor's subscription status
subscriptionSchema.post('save', async function(doc) {
  try {
    const Doctor = mongoose.model('Doctor');
    await Doctor.findByIdAndUpdate(doc.doctorId, {
      subscription: doc.status === 'active',
      subscriptionPlan: doc.planType,
      subscriptionEndDate: doc.endDate
    });
  } catch (error) {
    console.error('Error updating doctor subscription status:', error);
  }
});

// Methods
subscriptionSchema.methods = {
  isActive() { 
    return this.status === 'active' && this.endDate > new Date(); 
  },
  isExpired() {
    return this.endDate <= new Date();
  },
  daysRemaining() {
    const now = new Date();
    const diff = this.endDate - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  },
  async cancel(reason) {
    this.status = 'cancelled';
    this.cancelledAt = new Date();
    this.cancellationReason = reason;
    this.autoRenew = false;
    await this.save();
    return this;
  }
};

// Statics
subscriptionSchema.statics = {
  async getActiveSubscriptions() {
    return this.find({
      status: 'active',
      endDate: { $gt: new Date() }
    }).populate('doctorId');
  },
  async getExpiringSubscriptions(daysThreshold = 7) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
    
    return this.find({
      status: 'active',
      endDate: { $lte: thresholdDate, $gt: new Date() }
    }).populate('doctorId');
  },
  async getExpiredSubscriptions() {
    return this.find({
      status: 'active',
      endDate: { $lte: new Date() }
    }).populate('doctorId');
  }
};

module.exports = mongoose.model('Subscription', subscriptionSchema);