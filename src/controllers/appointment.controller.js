const Booking = require('../models/Booking');
const Doctor = require('../models/Doctor');
const User = require('../models/User');

// Get available slots for a doctor
exports.getAvailableSlots = async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    console.log('🔍 Getting available slots for doctor:', doctorId, 'date:', date);

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    // Find the doctor
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Get the day of week
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    
    // Find the time slots for that day
    const daySlot = doctor.timeSlots?.find(slot => slot.day === dayOfWeek);
    
    if (!daySlot || !daySlot.slots || daySlot.slots.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          slots: [],
          message: 'No slots available for this day'
        }
      });
    }

    // Get already booked appointments for this date
    const bookedAppointments = await Booking.find({
      doctorId: doctor._id,
      date: date,
      status: { $in: ['confirmed', 'pending'] }
    });

    const bookedTimes = bookedAppointments.map(apt => apt.time);

    // Filter out booked slots
    const availableSlots = daySlot.slots.filter(slot => 
      !bookedTimes.includes(slot.startTime) && slot.isAvailable !== false
    );

    res.status(200).json({
      success: true,
      data: {
        slots: availableSlots,
        total: availableSlots.length,
        date: date,
        dayOfWeek: dayOfWeek
      }
    });
  } catch (error) {
    console.error('❌ Error in getAvailableSlots:', error);
    next(error);
  }
};

// Book an appointment
exports.bookAppointment = async (req, res, next) => {
  try {
    const { doctorId, patientId, date, time, endTime, fee, doctorName, patientName } = req.body;

    console.log('📝 Booking appointment:', { doctorId, patientId, date, time });

    // Check if doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Check if patient exists
    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Check if slot is already booked
    const existingBooking = await Booking.findOne({
      doctorId,
      date,
      time,
      status: { $in: ['confirmed', 'pending'] }
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: 'This slot is already booked'
      });
    }

    // Create booking
    const booking = await Booking.create({
      doctorId,
      patientId,
      date,
      time,
      endTime: endTime || time,
      amount: fee || doctor.consultationFee || 500,
      status: 'confirmed',
      doctorName: doctorName || doctor.fullName,
      patientName: patientName || patient.fullName,
      createdAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      data: booking
    });
  } catch (error) {
    console.error('❌ Error in bookAppointment:', error);
    next(error);
  }
};

// Get patient's appointments
exports.getPatientAppointments = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { status } = req.query;

    let query = { patientId };
    if (status && status !== 'all') {
      query.status = status;
    }

    const appointments = await Booking.find(query)
      .populate('doctorId', 'fullName specialization clinicName profileImage')
      .sort({ date: -1, time: 1 });

    res.status(200).json({
      success: true,
      data: appointments
    });
  } catch (error) {
    console.error('❌ Error in getPatientAppointments:', error);
    next(error);
  }
};

// Get appointment by ID
exports.getAppointmentById = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await Booking.findById(appointmentId)
      .populate('doctorId', 'fullName specialization clinicName profileImage phoneNumber')
      .populate('patientId', 'fullName phoneNumber email');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    res.status(200).json({
      success: true,
      data: appointment
    });
  } catch (error) {
    console.error('❌ Error in getAppointmentById:', error);
    next(error);
  }
};

// Cancel appointment
exports.cancelAppointment = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;
    const { reason } = req.body;

    const booking = await Booking.findByIdAndUpdate(
      appointmentId,
      { 
        status: 'cancelled',
        cancellationReason: reason,
        cancelledAt: new Date()
      },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully',
      data: booking
    });
  } catch (error) {
    console.error('❌ Error in cancelAppointment:', error);
    next(error);
  }
};

// Reschedule appointment
exports.rescheduleAppointment = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;
    const { newDate, newTime } = req.body;

    const booking = await Booking.findById(appointmentId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if new slot is available
    const existingBooking = await Booking.findOne({
      doctorId: booking.doctorId,
      date: newDate,
      time: newTime,
      status: { $in: ['confirmed', 'pending'] }
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: 'The requested slot is already booked'
      });
    }

    booking.date = newDate;
    booking.time = newTime;
    booking.status = 'rescheduled';
    booking.rescheduledAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Appointment rescheduled successfully',
      data: booking
    });
  } catch (error) {
    console.error('❌ Error in rescheduleAppointment:', error);
    next(error);
  }
};

// Add review to appointment
exports.addReview = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;
    const { rating, comment } = req.body;

    const booking = await Booking.findById(appointmentId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed appointments'
      });
    }

    booking.review = { rating, comment, createdAt: new Date() };
    await booking.save();

    // Update doctor's average rating
    const doctor = await Doctor.findById(booking.doctorId);
    const allReviews = await Booking.find({
      doctorId: doctor._id,
      'review.rating': { $exists: true }
    });

    const totalRating = allReviews.reduce((sum, apt) => sum + apt.review.rating, 0);
    doctor.rating = totalRating / allReviews.length;
    doctor.totalReviews = allReviews.length;
    await doctor.save();

    res.status(200).json({
      success: true,
      message: 'Review added successfully',
      data: booking.review
    });
  } catch (error) {
    console.error('❌ Error in addReview:', error);
    next(error);
  }
};

// Get patient stats
exports.getPatientStats = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const totalAppointments = await Booking.countDocuments({ patientId });
    const completedAppointments = await Booking.countDocuments({ patientId, status: 'completed' });
    const cancelledAppointments = await Booking.countDocuments({ patientId, status: 'cancelled' });
    const upcomingAppointments = await Booking.countDocuments({
      patientId,
      date: { $gte: new Date().toISOString().split('T')[0] },
      status: 'confirmed'
    });

    res.status(200).json({
      success: true,
      data: {
        total: totalAppointments,
        completed: completedAppointments,
        cancelled: cancelledAppointments,
        upcoming: upcomingAppointments
      }
    });
  } catch (error) {
    console.error('❌ Error in getPatientStats:', error);
    next(error);
  }
};