// models/Slot.js
const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  doctorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Doctor', 
    required: true, 
    index: true 
  },
  date: { 
    type: Date, // Changed back to Date type for proper MongoDB queries
    required: true,
    index: true 
  },
  slotNumber: { 
    type: Number,
    required: true,
    min: 1,
    max: 60,
    index: true
  },
  startTime: { 
    type: String, 
    required: true 
  },
  endTime: { 
    type: String, 
    required: true 
  },
  duration: { 
    type: Number, 
    default: 30 
  },
  isAvailable: { 
    type: Boolean, 
    default: true 
  },
  isBooked: { 
    type: Boolean, 
    default: false 
  },
  status: { 
    type: String, 
    enum: ['available', 'booked', 'blocked', 'cancelled'], 
    default: 'available' 
  },
  bookingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Booking', 
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

// ⭐ FIXED INDEX - Use compound unique index to prevent duplicates
// Remove the separate unique index and use a single compound index
slotSchema.index({ doctorId: 1, date: 1, slotNumber: 1 }, { unique: true });

// Index for faster queries
slotSchema.index({ doctorId: 1, date: 1, status: 1 });
slotSchema.index({ doctorId: 1, isAvailable: 1 });
slotSchema.index({ bookingId: 1 });

// Update timestamp on save
slotSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method to check if slot is available
slotSchema.methods.isSlotAvailable = function() {
  return this.isAvailable && !this.isBooked && this.status === 'available';
};

// Method to book the slot
slotSchema.methods.book = async function(bookingId) {
  this.isAvailable = false;
  this.isBooked = true;
  this.status = 'booked';
  this.bookingId = bookingId;
  return await this.save();
};

// Method to release the slot
slotSchema.methods.release = async function() {
  this.isAvailable = true;
  this.isBooked = false;
  this.status = 'available';
  this.bookingId = null;
  return await this.save();
};

// Virtual for formatted response
slotSchema.virtual('formattedResponse').get(function() {
  return {
    id: this._id,
    slotNumber: this.slotNumber,
    startTime: this.startTime,
    endTime: this.endTime,
    duration: this.duration,
    isAvailable: this.isSlotAvailable(),
    isBooked: this.isBooked,
    status: this.status,
    date: this.date
  };
});

// Static method to get time from slot number
slotSchema.statics.getTimeFromSlotNumber = function(slotNumber, startTime, endTime, totalSlots) {
  if (!startTime || !endTime || !totalSlots) return null;
  
  const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };
  
  const openMinutes = timeToMinutes(startTime);
  const closeMinutes = timeToMinutes(endTime);
  const totalMinutes = closeMinutes - openMinutes;
  const slotDurationMinutes = totalMinutes / totalSlots;
  
  const startMinutes = openMinutes + (slotNumber - 1) * slotDurationMinutes;
  const endMinutes = startMinutes + slotDurationMinutes;
  
  return {
    start: minutesToTime(startMinutes),
    end: minutesToTime(endMinutes)
  };
};

// Static method to generate slots for a date
slotSchema.statics.generateSlotsForDate = async function(doctorId, date, startTime, endTime, slotDuration = 30, lunchBreak = null) {
  const slots = [];
  const start = new Date(`${date}T${startTime}`);
  const end = new Date(`${date}T${endTime}`);
  
  let current = new Date(start);
  let slotNumber = 1;
  
  while (current < end) {
    const slotEnd = new Date(current.getTime() + slotDuration * 60000);
    
    // Skip lunch break
    if (lunchBreak && lunchBreak.start && lunchBreak.end) {
      const lunchStart = new Date(`${date}T${lunchBreak.start}`);
      const lunchEnd = new Date(`${date}T${lunchBreak.end}`);
      
      if (current >= lunchStart && current < lunchEnd) {
        current = new Date(lunchEnd);
        continue;
      }
    }
    
    if (slotEnd <= end) {
      slots.push({
        doctorId,
        date: new Date(date),
        slotNumber: slotNumber++,
        startTime: current.toTimeString().slice(0, 5),
        endTime: slotEnd.toTimeString().slice(0, 5),
        duration: slotDuration,
        isAvailable: true,
        isBooked: false,
        status: 'available'
      });
    }
    
    current = slotEnd;
  }
  
  return slots;
};

// Ensure virtuals are included in JSON output
slotSchema.set('toJSON', { virtuals: true });
slotSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Slot', slotSchema);