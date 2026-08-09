// Backend/src/models/Booking.js
const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // Booking ID for reference
  bookingId: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Doctor information
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    index: true
  },
  doctorName: {
    type: String,
    required: true
  },
  specialty: {
    type: String
  },
  hospital: {
    type: String
  },

  // Patient information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true
  },
  patientName: {
    type: String,
    required: true
  },
  patientPhone: {
    type: String,
    required: true
  },

  // Appointment details
  bookingDate: {
    type: Date,
    required: true,
    index: true
  },
  date: {
    type: String,
    required: true,
    index: true
  },
  timeSlot: {
    type: String,
    required: true  // ✅ This is required - make sure you're sending it
  },
  time: {
    type: String
  },
  
  // Slot information
  slotNumber: {
    type: Number,
    required: true,
    index: true,
    min: 1,
    max: 60
  },
  
  startTime: {
    type: String
  },
  endTime: {
    type: String
  },

  // Queue information
  peopleAhead: {
    type: Number,
    default: 0
  },
  expectedTime: {
    type: String
  },

  // Status management
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'in-progress'],
    default: 'confirmed'
  },

  // Booking type
  bookingType: {
    type: String,
    enum: ['online', 'walk-in', 'offline'],
    default: 'online'
  },
  appointmentType: {
    type: String,
    enum: ['online', 'offline'],
    default: 'online'
  },

  // Consultation details
  consultationType: {
    type: String,
    enum: ['clinic', 'video', 'phone'],
    default: 'clinic'
  },
  symptoms: String,
  
  // Payment fields
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'paid', 'not-applicable'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'cash', 'card', 'upi', 'not-applicable'],
    default: 'online'
  },
  amount: {
    type: Number,
    default: 500
  },

  // Tracking fields
  cancellationReason: String,
  cancelledAt: Date,
  rescheduledFrom: String,
  rescheduledAt: Date,
  completedAt: Date,
  
  // Timestamps
  bookedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },

  // Review fields
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  review: {
    type: String
  }
});

// Update timestamp on save
bookingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Set date string from bookingDate if not set
  if (this.bookingDate && !this.date) {
    this.date = this.bookingDate.toISOString().split('T')[0];
  }
  
  // Set time from timeSlot if not set
  if (this.timeSlot && !this.time) {
    this.time = this.timeSlot;
  }
  
  // Set patientId from userId if not set
  if (this.userId && !this.patientId) {
    this.patientId = this.userId;
  }
  
  // Set userId from patientId if not set
  if (this.patientId && !this.userId) {
    this.userId = this.patientId;
  }
  
  next();
});

// Generate booking ID if not provided
bookingSchema.pre('save', async function(next) {
  if (!this.bookingId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.bookingId = `BK${year}${month}${day}${random}`;
  }
  next();
});

// Indexes for faster queries
bookingSchema.index({ doctorId: 1, bookingDate: 1 });
bookingSchema.index({ userId: 1, bookingDate: 1 });
bookingSchema.index({ patientId: 1, bookingDate: 1 });
bookingSchema.index({ patientPhone: 1, bookingDate: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ slotNumber: 1, bookingDate: 1 });
bookingSchema.index({ bookingType: 1 });

// Virtual for formatted response
bookingSchema.virtual('formattedResponse').get(function() {
  return {
    id: this._id,
    _id: this._id,
    bookingId: this.bookingId,
    doctorId: this.doctorId,
    doctorName: this.doctorName,
    specialty: this.specialty,
    hospital: this.hospital,
    userId: this.userId,
    patientId: this.patientId,
    patientName: this.patientName,
    patientPhone: this.patientPhone,
    date: this.date,
    bookingDate: this.bookingDate,
    time: this.time || this.timeSlot,
    timeSlot: this.timeSlot,
    slotNumber: this.slotNumber,
    status: this.status,
    bookingType: this.bookingType,
    appointmentType: this.appointmentType,
    isWalkIn: this.bookingType === 'walk-in',
    amount: this.amount,
    paymentStatus: this.paymentStatus,
    paymentMethod: this.paymentMethod,
    rating: this.rating,
    review: this.review,
    peopleAhead: this.peopleAhead,
    expectedTime: this.expectedTime,
    startTime: this.startTime,
    endTime: this.endTime,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
});

// Ensure virtuals are included in JSON output
bookingSchema.set('toJSON', { virtuals: true });
bookingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Booking', bookingSchema);