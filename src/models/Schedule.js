const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    unique: true
  },
  workingDays: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    // ============ FIXED: Default to empty array (all days closed) ============
    default: []
  }],
  startTime: {
    type: String,
    required: true,
    default: '09:00'
  },
  endTime: {
    type: String,
    required: true,
    default: '18:00'
  },
  dayTimes: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      monday: { openTime: '09:00', closeTime: '18:00' },
      tuesday: { openTime: '09:00', closeTime: '18:00' },
      wednesday: { openTime: '09:00', closeTime: '18:00' },
      thursday: { openTime: '09:00', closeTime: '18:00' },
      friday: { openTime: '09:00', closeTime: '18:00' },
      saturday: { openTime: '09:00', closeTime: '18:00' },
      sunday: { openTime: '09:00', closeTime: '18:00' }
    }
  },
  totalSlotsPerDay: {
    type: Number,
    default: 30
  },
  slotDuration: {
    type: Number,
    default: 30
  },
  consultationDuration: {
    type: Number,
    default: 30
  },
  breakBetweenSlots: {
    type: Number,
    default: 5
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'leave', 'open', 'closed'],
    default: 'inactive' // ============ FIXED: Default to inactive ============
  },
  isActive: {
    type: Boolean,
    default: false // ============ FIXED: Default to false ============
  },
  lunchBreak: {
    start: { type: String, default: '13:00' },
    end: { type: String, default: '14:00' },
    enabled: { type: Boolean, default: true }
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
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ============ INDEXES ============
scheduleSchema.index({ doctorId: 1 });
scheduleSchema.index({ doctorId: 1, status: 1, isActive: 1 });
scheduleSchema.index({ isActive: 1, status: 1 });
scheduleSchema.index({ updatedAt: -1 });
scheduleSchema.index({ workingDays: 1 });
scheduleSchema.index({ createdAt: -1, updatedAt: -1 });
scheduleSchema.index({ startTime: 1, endTime: 1 });

// ============ MIDDLEWARE ============
scheduleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

scheduleSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// ============ INSTANCE METHODS ============
scheduleSchema.methods.getDayTimes = function(dayKey) {
  if (!this.dayTimes) {
    const defaultDayTimes = {
      monday: { openTime: '09:00', closeTime: '18:00' },
      tuesday: { openTime: '09:00', closeTime: '18:00' },
      wednesday: { openTime: '09:00', closeTime: '18:00' },
      thursday: { openTime: '09:00', closeTime: '18:00' },
      friday: { openTime: '09:00', closeTime: '18:00' },
      saturday: { openTime: '09:00', closeTime: '18:00' },
      sunday: { openTime: '09:00', closeTime: '18:00' }
    };
    this.dayTimes = defaultDayTimes;
  }
  return this.dayTimes[dayKey] || { openTime: this.startTime, closeTime: this.endTime };
};

scheduleSchema.methods.setDayTimes = function(dayKey, openTime, closeTime) {
  if (!this.dayTimes) {
    const defaultDayTimes = {
      monday: { openTime: '09:00', closeTime: '18:00' },
      tuesday: { openTime: '09:00', closeTime: '18:00' },
      wednesday: { openTime: '09:00', closeTime: '18:00' },
      thursday: { openTime: '09:00', closeTime: '18:00' },
      friday: { openTime: '09:00', closeTime: '18:00' },
      saturday: { openTime: '09:00', closeTime: '18:00' },
      sunday: { openTime: '09:00', closeTime: '18:00' }
    };
    this.dayTimes = defaultDayTimes;
  }
  this.dayTimes[dayKey] = { openTime, closeTime };
};

scheduleSchema.methods.calculateTotalSlots = function() {
  if (!this.startTime || !this.endTime || !this.slotDuration) return 0;
  
  const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  const openMinutes = timeToMinutes(this.startTime);
  const closeMinutes = timeToMinutes(this.endTime);
  const totalMinutes = closeMinutes - openMinutes;
  
  let lunchMinutes = 0;
  if (this.lunchBreak && this.lunchBreak.enabled && this.lunchBreak.start && this.lunchBreak.end) {
    const lunchStart = timeToMinutes(this.lunchBreak.start);
    const lunchEnd = timeToMinutes(this.lunchBreak.end);
    if (lunchStart >= openMinutes && lunchEnd <= closeMinutes) {
      lunchMinutes = lunchEnd - lunchStart;
    }
  }
  
  const availableMinutes = totalMinutes - lunchMinutes;
  return Math.floor(availableMinutes / this.slotDuration);
};

scheduleSchema.methods.isWorkingDay = function(dayOfWeek) {
  return this.workingDays && this.workingDays.includes(dayOfWeek);
};

scheduleSchema.methods.isWithinAdvanceBooking = function(date) {
  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + this.maxAdvanceBooking);
  return date <= maxDate;
};

scheduleSchema.methods.isTimeAvailable = function(time) {
  const timeToMinutes = (t) => {
    const [hours, minutes] = t.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  const slotMinutes = timeToMinutes(time);
  const openMinutes = timeToMinutes(this.startTime);
  const closeMinutes = timeToMinutes(this.endTime);
  const lunchStart = timeToMinutes(this.lunchBreak.start);
  const lunchEnd = timeToMinutes(this.lunchBreak.end);
  
  if (slotMinutes < openMinutes || slotMinutes >= closeMinutes) {
    return false;
  }
  
  if (this.lunchBreak.enabled && slotMinutes >= lunchStart && slotMinutes < lunchEnd) {
    return false;
  }
  
  return true;
};

scheduleSchema.methods.getAvailableSlots = function() {
  const slots = [];
  const timeToMinutes = (t) => {
    const [hours, minutes] = t.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  const openMinutes = timeToMinutes(this.startTime);
  const closeMinutes = timeToMinutes(this.endTime);
  const lunchStart = timeToMinutes(this.lunchBreak.start);
  const lunchEnd = timeToMinutes(this.lunchBreak.end);
  const totalSlots = this.calculateTotalSlots();
  
  for (let i = 0; i < totalSlots; i++) {
    const startMinutes = openMinutes + (i * this.slotDuration);
    let endMinutes = startMinutes + this.slotDuration;
    
    if (this.lunchBreak.enabled && startMinutes >= lunchStart && startMinutes < lunchEnd) {
      continue;
    }
    
    if (endMinutes > closeMinutes) {
      endMinutes = closeMinutes;
    }
    
    const formatTime = (minutes) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };
    
    slots.push({
      slotNumber: i + 1,
      startTime: formatTime(startMinutes),
      endTime: formatTime(endMinutes),
      duration: this.slotDuration,
      isBooked: false
    });
  }
  
  return slots;
};

// ============ STATIC METHODS ============
scheduleSchema.statics.findByDoctorId = function(doctorId) {
  return this.findOne({ doctorId }).lean();
};

scheduleSchema.statics.findActiveSchedules = function() {
  return this.find({ isActive: true, status: 'active' }).populate('doctorId', 'name email specialization');
};

scheduleSchema.statics.updateByDoctorId = function(doctorId, updateData) {
  return this.findOneAndUpdate(
    { doctorId },
    { ...updateData, updatedAt: Date.now() },
    { new: true, upsert: true }
  );
};

// ============ VIRTUALS ============
scheduleSchema.virtual('formattedResponse').get(function() {
  return {
    doctorId: this.doctorId,
    workingDays: this.workingDays,
    startTime: this.startTime,
    endTime: this.endTime,
    totalSlotsPerDay: this.totalSlotsPerDay,
    calculatedTotalSlots: this.calculateTotalSlots(),
    availableSlots: this.getAvailableSlots(),
    slotDuration: this.slotDuration,
    consultationDuration: this.consultationDuration,
    breakBetweenSlots: this.breakBetweenSlots,
    lunchBreak: this.lunchBreak,
    bufferTime: this.bufferTime,
    maxAdvanceBooking: this.maxAdvanceBooking,
    isActive: this.isActive,
    status: this.status,
    timezone: this.timezone,
    updatedAt: this.updatedAt
  };
});

scheduleSchema.virtual('summary').get(function() {
  return {
    doctorId: this.doctorId,
    workingDays: this.workingDays.length,
    workingHours: `${this.startTime} - ${this.endTime}`,
    totalSlots: this.calculateTotalSlots(),
    isActive: this.isActive,
    status: this.status
  };
});

scheduleSchema.set('toJSON', { virtuals: true });
scheduleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Schedule', scheduleSchema);