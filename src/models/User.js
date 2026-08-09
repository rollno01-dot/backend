const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: false,
    trim: true
  },
  name: {
    type: String,
    trim: true
  },
  displayName: {
    type: String,
    trim: true
  },
  username: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true
  },
  // ============ PASSWORD FIELD ============
  password: {
    type: String,
    select: false // Don't return password by default
  },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'admin'],
    default: 'patient'
  },
  isWalkIn: {
    type: Boolean,
    default: false
  },
  isApproved: {
    type: Boolean,
    default: true
  },
  // ============ DOCTOR FIELDS ============
  specialization: {
    type: String,
    default: ''
  },
  qualification: {
    type: String,
    default: ''
  },
  experience: {
    type: Number,
    default: 0
  },
  clinicName: {
    type: String,
    default: ''
  },
  consultationFee: {
    type: Number,
    default: 500
  },
  // ============ SUBSCRIPTION FIELDS ============
  subscription: {
    type: Boolean,
    default: false
  },
  subscriptionPlan: {
    type: String,
    enum: ['free', 'basic', 'premium', 'enterprise'],
    default: 'free'
  },
  subscriptionEndDate: {
    type: Date,
    default: null
  },
  // ============ OTHER FIELDS ============
  profileImage: {
    type: String,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ============ PRE-SAVE MIDDLEWARE ============
userSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  
  // Hash password if it's modified
  if (this.isModified('password') && this.password) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      console.log('🔐 Password hashed for user:', this.email || this.phoneNumber);
    } catch (error) {
      console.error('❌ Error hashing password:', error);
      return next(error);
    }
  }
  
  next();
});

// ============ COMPARE PASSWORD METHOD ============
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    if (!this.password) {
      console.log('⚠️ No password stored for user');
      return false;
    }
    
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    console.log('🔐 Password match:', isMatch);
    return isMatch;
  } catch (error) {
    console.error('❌ Password comparison error:', error);
    return false;
  }
};

// ============ VIRTUAL FIELDS ============
userSchema.virtual('isDoctor').get(function() {
  return this.role === 'doctor';
});

userSchema.virtual('isAdmin').get(function() {
  return this.role === 'admin';
});

userSchema.virtual('isPatient').get(function() {
  return this.role === 'patient';
});

// ============ INDEXES ============
userSchema.index({ email: 1 });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ role: 1 });

// Ensure virtuals are included in JSON output
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);