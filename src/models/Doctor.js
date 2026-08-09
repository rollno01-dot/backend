const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  fullName: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  specialization: {
    type: String,
    required: true
  },
  qualification: {
    type: String,
    required: true
  },
  experience: {
    type: Number,
    required: true
  },
  registrationNumber: {
    type: String,
    required: true,
    unique: true
  },
  consultationFee: {
    type: Number,
    required: true
  },
  clinicAddress: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String
  },
  clinicName: String,
  profileImage: {
    type: String,
    default: null,
    set: function(value) {
      if (!value) return null;
      if (value.includes('via.placeholder.com') || 
          value.includes('placeholder') ||
          value === 'No image' ||
          value === 'null') {
        return null;
      }
      return value;
    }
  },
  availableDays: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  }],
  timeSlots: [{
    day: String,
    slots: [{
      startTime: String,
      endTime: String,
      maxPatients: Number,
      isAvailable: { type: Boolean, default: true }
    }]
  }],
  startTime: {
    type: String,
    default: '09:00'
  },
  endTime: {
    type: String,
    default: '17:00'
  },
  slotDuration: {
    type: Number,
    default: 30
  },
  lunchBreak: {
    start: { type: String, default: '13:00' },
    end: { type: String, default: '14:00' }
  },
  bufferTime: {
    type: Number,
    default: 15
  },
  maxAdvanceBooking: {
    type: Number,
    default: 30
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  },
  workingDays: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  }],
  homeService: {
    type: Boolean,
    default: false
  },
  weeklySchedule: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  documents: [{
    url: String,
    name: String
  }],
  isApproved: {
    type: Boolean,
    default: true
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    branch: String,
    upiId: String,
    accountType: {
      type: String,
      enum: ['savings', 'current'],
      default: 'savings'
    },
    verified: {
      type: Boolean,
      default: false
    },
    updatedAt: Date
  },
  subscription: {
    type: Boolean,
    default: false
  },
  subscriptionPlan: {
    type: String,
    enum: ['free', 'basic', 'premium', 'monthly', 'yearly', 'quarterly'],
    default: 'free'
  },
  subscriptionExpiry: {
    type: Date
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

// Indexes for faster queries
doctorSchema.index({ specialization: 1, 'clinicAddress.city': 1 });
doctorSchema.index({ rating: -1 });
doctorSchema.index({ isApproved: 1 });
doctorSchema.index({ userId: 1 });

// Pre-save middleware
doctorSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.fullName && !this.name) {
    this.name = this.fullName;
  }
  next();
});

// Virtual for working days
doctorSchema.virtual('workingDaysList').get(function() {
  return this.workingDays || this.availableDays || [];
});

// Method to check if doctor works on a specific day
doctorSchema.methods.isWorkingDay = function(dayOfWeek) {
  const workingDays = this.workingDays || this.availableDays || [];
  return workingDays.includes(dayOfWeek);
};

// Method to get total slots per day
doctorSchema.methods.getTotalSlotsPerDay = function() {
  if (!this.startTime || !this.endTime || !this.slotDuration) return 0;
  
  const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  const openMinutes = timeToMinutes(this.startTime);
  const closeMinutes = timeToMinutes(this.endTime);
  const totalMinutes = closeMinutes - openMinutes;
  
  // Subtract lunch break if within working hours
  let lunchMinutes = 0;
  if (this.lunchBreak && this.lunchBreak.start && this.lunchBreak.end) {
    const lunchStart = timeToMinutes(this.lunchBreak.start);
    const lunchEnd = timeToMinutes(this.lunchBreak.end);
    if (lunchStart >= openMinutes && lunchEnd <= closeMinutes) {
      lunchMinutes = lunchEnd - lunchStart;
    }
  }
  
  const availableMinutes = totalMinutes - lunchMinutes;
  return Math.floor(availableMinutes / this.slotDuration);
};

// Ensure virtuals are included in JSON output
doctorSchema.set('toJSON', { virtuals: true });
doctorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Doctor', doctorSchema);