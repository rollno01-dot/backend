const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    index: true
  },
  otp: {
    type: String,
    required: [true, 'OTP is required'],
    trim: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  },
  attempts: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  verified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // Auto-delete after 10 minutes (TTL index)
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Compound index for faster queries
OTPSchema.index({ phoneNumber: 1, otp: 1 });

// Method to check if OTP is expired
OTPSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

// Method to increment attempts
OTPSchema.methods.incrementAttempts = async function() {
  this.attempts += 1;
  await this.save();
  return this.attempts;
};

// Method to check if max attempts reached
OTPSchema.methods.isMaxAttemptsReached = function() {
  return this.attempts >= 5;
};

// Static method to clean expired OTPs
OTPSchema.statics.cleanExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
  console.log(`🧹 Cleaned ${result.deletedCount} expired OTPs`);
  return result;
};

module.exports = mongoose.model('OTP', OTPSchema);