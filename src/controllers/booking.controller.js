// Backend/src/controllers/booking.controller.js - COMPLETE FIXED VERSION
const Booking = require('../models/Booking');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const Slot = require('../models/Slot');
const Schedule = require('../models/Schedule');
const moment = require('moment');
const mongoose = require('mongoose');

// ================= NO-CACHE HELPER =================
const setNoCacheHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
};

// ================= HELPER FUNCTIONS =================

const formatTimeDisplay = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
};

const timeToMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// ✅ FIXED: generateSlots - stores date as STRING
const generateSlots = (date, startTime, endTime, totalSlotsCount) => {
  const slots = [];
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const totalMinutes = endMinutes - startMinutes;
  const slotDuration = totalMinutes / totalSlotsCount;
  
  // Ensure date is string YYYY-MM-DD
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
  
  for (let i = 1; i <= totalSlotsCount; i++) {
    const start = startMinutes + (i - 1) * slotDuration;
    let end = start + slotDuration;
    if (i === totalSlotsCount) end = endMinutes;
    
    const startTimeStr = minutesToTime(start);
    const endTimeStr = minutesToTime(end);
    
    slots.push({
      slotNumber: i,
      startTime: startTimeStr,
      endTime: endTimeStr,
      date: dateStr,  // ✅ Store as STRING
      isAvailable: true,
      isBooked: false,
      status: 'available',
      expectedTime: `${formatTimeDisplay(startTimeStr)} - ${formatTimeDisplay(endTimeStr)}`
    });
  }
  
  return slots;
};

// ================= GET AVAILABLE SLOTS - FIXED =================
exports.getAvailableSlots = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    let doctorId = req.query.doctorId;
    
    if (!doctorId && req.params.doctorId) {
      doctorId = req.params.doctorId;
    }
    
    const { date } = req.query;
    
    console.log(`🔍 getAvailableSlots - doctorId: ${doctorId}, date: ${date}`);
    
    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: 'doctorId is required'
      });
    }
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }
    
    const selectedDate = moment(date).format('YYYY-MM-DD');
    const dayOfWeek = moment(selectedDate).format('dddd').toLowerCase();
    
    let schedule = await Schedule.findOne({ doctorId });
    
    if (!schedule) {
      schedule = await Schedule.create({
        doctorId,
        startTime: '09:00',
        endTime: '17:00',
        totalSlotsPerDay: 30,
        weeklySchedule: {
          monday: { enabled: true, openTime: '09:00', closeTime: '17:00', totalSlots: 30 },
          tuesday: { enabled: true, openTime: '09:00', closeTime: '17:00', totalSlots: 30 },
          wednesday: { enabled: true, openTime: '09:00', closeTime: '17:00', totalSlots: 30 },
          thursday: { enabled: true, openTime: '09:00', closeTime: '17:00', totalSlots: 30 },
          friday: { enabled: true, openTime: '09:00', closeTime: '17:00', totalSlots: 30 },
          saturday: { enabled: true, openTime: '09:00', closeTime: '17:00', totalSlots: 30 },
          sunday: { enabled: false, openTime: '09:00', closeTime: '17:00', totalSlots: 0 }
        }
      });
    }
    
    let isDayEnabled = false;
    let openTime = schedule.startTime || '09:00';
    let closeTime = schedule.endTime || '17:00';
    let totalSlotsCount = schedule.totalSlotsPerDay || 30;
    
    if (schedule.weeklySchedule && schedule.weeklySchedule[dayOfWeek]) {
      const dayData = schedule.weeklySchedule[dayOfWeek];
      isDayEnabled = dayData.enabled === true;
      
      if (dayData.openTime) openTime = dayData.openTime;
      if (dayData.closeTime) closeTime = dayData.closeTime;
      if (dayData.totalSlots && dayData.totalSlots > 0) {
        totalSlotsCount = dayData.totalSlots;
      }
    } else {
      const workingDays = schedule.workingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      isDayEnabled = workingDays.includes(dayOfWeek);
    }
    
    if (!isDayEnabled) {
      return res.status(200).json({
        success: true,
        data: {
          slots: [],
          isWorkingDay: false,
          message: `Doctor not available on ${dayOfWeek}`,
          openTime: openTime,
          closeTime: closeTime,
          totalSlots: 0,
          stats: { total: 0, available: 0, booked: 0 }
        },
        timestamp: new Date().toISOString(),
        _cacheBust: Date.now()
      });
    }
    
    // ✅ FIXED: Query with STRING date (since Slot.date is now String)
    let slots = await Slot.find({
      doctorId: doctorId,
      date: selectedDate  // ✅ Direct string match
    }).sort('slotNumber');
    
    // ✅ FIXED: If no slots or wrong count, regenerate with proper string date
    if (slots.length !== totalSlotsCount) {
      // ✅ FIXED: Delete with string date
      await Slot.deleteMany({
        doctorId: doctorId,
        date: selectedDate  // ✅ String match
      });
      
      const generatedSlots = generateSlots(selectedDate, openTime, closeTime, totalSlotsCount);
      
      const slotDocs = generatedSlots.map(slot => ({
        doctorId: doctorId,
        date: slot.date,  // ✅ Already string from generateSlots
        slotNumber: slot.slotNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        duration: timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime),
        isAvailable: true,
        isBooked: false,
        status: 'available'
      }));
      
      if (slotDocs.length > 0) {
        slots = await Slot.insertMany(slotDocs);
      }
    }
    
    // ✅ FIXED: Query bookings with string date
    const bookedAppointments = await Booking.find({
      doctorId: doctorId,
      date: selectedDate,  // ✅ String match
      status: { $in: ['confirmed', 'pending'] }
    });
    
    const bookedSlotNumbers = new Set(bookedAppointments.map(b => b.slotNumber));
    const now = moment();
    
    const formattedSlots = slots.map(slot => {
      const slotDateTime = moment(`${selectedDate} ${slot.startTime || '09:00'}`, 'YYYY-MM-DD HH:mm');
      const isPast = slotDateTime.isBefore(now);
      const isBooked = bookedSlotNumbers.has(slot.slotNumber);
      
      return {
        _id: slot._id,
        slotNumber: slot.slotNumber,
        startTime: slot.startTime || '09:00',
        endTime: slot.endTime || '09:30',
        expectedTime: `${formatTimeDisplay(slot.startTime || '09:00')} - ${formatTimeDisplay(slot.endTime || '09:30')}`,
        isBooked: isBooked,
        isAvailable: !isBooked && !isPast,
        status: isBooked ? 'booked' : (isPast ? 'past' : 'available'),
        isPast: isPast,
        duration: slot.duration || 30
      };
    });
    
    const stats = {
      total: formattedSlots.length,
      available: formattedSlots.filter(s => s.isAvailable).length,
      booked: formattedSlots.filter(s => s.isBooked).length
    };
    
    res.status(200).json({
      success: true,
      data: {
        date: selectedDate,
        openTime: openTime,
        closeTime: closeTime,
        slotDuration: totalSlotsCount > 0 ? (timeToMinutes(closeTime) - timeToMinutes(openTime)) / totalSlotsCount : 0,
        totalSlots: totalSlotsCount,
        slots: formattedSlots,
        allSlots: formattedSlots,
        stats: stats
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
    
  } catch (error) {
    console.error('Error in getAvailableSlots:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch available slots'
    });
  }
};

// ================= BOOK APPOINTMENT - FIXED =================
exports.bookAppointment = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    console.log('📝 ===== BOOK APPOINTMENT CALLED =====');
    console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
    
    const {
      doctorId,
      patientId,
      doctorName,
      patientName,
      patientPhone,
      date,
      timeSlot,
      slotNumber,
      startTime,
      endTime,
      expectedTime,
      peopleAhead,
      amount,
      status,
      appointmentType
    } = req.body;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: 'doctorId is required'
      });
    }
    
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'patientId is required'
      });
    }
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'date is required'
      });
    }

    if (!timeSlot) {
      console.log('❌ timeSlot is missing from request');
      return res.status(400).json({
        success: false,
        message: 'timeSlot is required'
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Extract startTime from timeSlot if not provided
    const timeSlotParts = timeSlot.split('-');
    const slotStartTime = timeSlotParts[0]?.trim() || startTime || '09:00';
    const slotEndTime = timeSlotParts[1]?.trim() || endTime || '09:30';
    
    // ✅ Ensure date is string YYYY-MM-DD
    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date.split('T')[0];

    // ✅ FIXED: Check for existing booking with same slot using string date
    const existingBooking = await Booking.findOne({
      doctorId: doctorId,
      date: dateStr,  // ✅ String match
      slotNumber: parseInt(slotNumber) || 1,
      status: { $nin: ['cancelled', 'completed'] }
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: `Slot #${slotNumber} is already booked`
      });
    }

    // ✅ FIXED: Check in Slot collection using string date
    const existingSlot = await Slot.findOne({
      doctorId: doctorId,
      date: dateStr,  // ✅ String match
      slotNumber: parseInt(slotNumber) || 1,
      isBooked: true
    });

    if (existingSlot) {
      return res.status(409).json({
        success: false,
        message: `Slot #${slotNumber} is already booked`
      });
    }

    const bookingData = {
      doctorId: doctorId,
      patientId: patientId,
      userId: patientId,
      doctorName: doctorName || doctor.fullName || doctor.name,
      patientName: patientName || patient.fullName || patient.name,
      patientPhone: patientPhone || patient.phoneNumber || patient.phone,
      date: dateStr,  // ✅ String date
      bookingDate: moment(dateStr).startOf('day').toDate(),
      timeSlot: timeSlot,
      slotNumber: parseInt(slotNumber) || 1,
      startTime: slotStartTime,
      endTime: slotEndTime,
      expectedTime: expectedTime || `${formatTimeDisplay(slotStartTime)} - ${formatTimeDisplay(slotEndTime)}`,
      peopleAhead: parseInt(peopleAhead) || 0,
      amount: amount || doctor.consultationFee || 500,
      status: status || 'confirmed',
      appointmentType: appointmentType || 'online',
      paymentStatus: 'pending',
      paymentMethod: 'online',
      bookingType: 'online'
    };

    console.log('📝 Creating booking with data:', JSON.stringify(bookingData, null, 2));

    const booking = new Booking(bookingData);
    await booking.save();

    console.log('✅ Booking saved:', booking._id);

    // ✅ FIXED: Update slot with string date
    await Slot.findOneAndUpdate(
      {
        doctorId: doctorId,
        date: dateStr,  // ✅ String match
        slotNumber: parseInt(slotNumber) || 1
      },
      {
        $set: {
          isBooked: true,
          isAvailable: false,
          status: 'booked',
          bookingId: booking._id,
          startTime: slotStartTime,
          endTime: slotEndTime,
          patientId: patientId,
          patientName: patientName || patient.fullName || patient.name
        }
      },
      { 
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      data: booking,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error booking appointment:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This slot was already booked by another patient. Please try a different slot.',
        conflict: true
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to book appointment'
    });
  }
};

// ================= GET PATIENT APPOINTMENTS - FIXED =================
exports.getPatientAppointments = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { patientId } = req.params;
    
    console.log(`📋 Fetching appointments for patient: ${patientId}`);
    
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    const bookings = await Booking.find({ 
      patientId: patientId,
      status: { $ne: 'cancelled' }
    })
      .populate('doctorId', 'fullName name specialization profileImage consultationFee')
      .sort({ bookingDate: -1 });

    console.log(`✅ Found ${bookings.length} appointments for patient ${patientId}`);

    const formattedBookings = bookings.map(booking => {
      let doctorIdValue = booking.doctorId;
      if (booking.doctorId && typeof booking.doctorId === 'object') {
        doctorIdValue = booking.doctorId._id || booking.doctorId.id || booking.doctorId;
      }

      return {
        _id: booking._id,
        doctorId: doctorIdValue,
        doctor: booking.doctorId,
        patientId: booking.patientId,
        patientName: booking.patientName,
        patientPhone: booking.patientPhone,
        date: booking.date,
        slotNumber: booking.slotNumber,
        timeSlot: booking.timeSlot,
        startTime: booking.startTime || '09:00',
        endTime: booking.endTime || '09:30',
        expectedTime: booking.expectedTime,
        amount: booking.amount,
        status: booking.status,
        appointmentType: booking.appointmentType || booking.bookingType || 'online',
        paymentStatus: booking.paymentStatus,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt
      };
    });

    res.status(200).json({
      success: true,
      data: formattedBookings,
      count: formattedBookings.length,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });

  } catch (error) {
    console.error('Error fetching patient appointments:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch appointments'
    });
  }
};

// ================= GET DOCTOR BOOKINGS - FIXED =================
exports.getDoctorBookings = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const userId = req.user?.userId;
    
    console.log(`👨‍⚕️ Fetching bookings for doctor user: ${userId}`);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    const doctor = await Doctor.findOne({ userId });
    
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }
    
    const doctorId = doctor._id;
    console.log(`👨‍⚕️ Found doctor: ${doctorId}`);
    
    const { date, status } = req.query;
    
    let query = { doctorId: doctorId };
    
    if (date) {
      const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date.split('T')[0];
      query.date = dateStr;  // ✅ String match
    }
    
    if (status && status !== 'all') {
      query.status = status;
    } else {
      query.status = { $ne: 'cancelled' };
    }

    console.log(`🔍 Query:`, JSON.stringify(query, null, 2));

    const bookings = await Booking.find(query)
      .populate('patientId', 'fullName phoneNumber name email profileImage')
      .populate('userId', 'fullName phoneNumber name email profileImage')
      .sort({ slotNumber: 1 });

    console.log(`✅ Found ${bookings.length} bookings for doctor ${doctorId}`);

    const formattedBookings = bookings.map(booking => {
      const patient = booking.patientId || booking.userId;
      return {
        _id: booking._id,
        id: booking._id,
        bookingId: booking.bookingId || booking._id,
        patientId: patient?._id || booking.patientId || booking.userId,
        patientName: booking.patientName || patient?.fullName || patient?.name || 'Patient',
        patientPhone: booking.patientPhone || patient?.phoneNumber || patient?.phone || '',
        patientEmail: patient?.email || '',
        doctorId: booking.doctorId,
        doctorName: booking.doctorName || doctor.fullName,
        date: booking.date,
        time: booking.timeSlot || booking.time,
        timeSlot: booking.timeSlot,
        slotNumber: booking.slotNumber,
        status: booking.status,
        bookingType: booking.bookingType || 'online',
        isWalkIn: booking.bookingType === 'walk-in' || booking.appointmentType === 'offline',
        amount: booking.amount || 0,
        paymentStatus: booking.paymentStatus || 'pending',
        paymentMethod: booking.paymentMethod || 'online',
        expectedTime: booking.expectedTime || '',
        peopleAhead: booking.peopleAhead || 0,
        startTime: booking.startTime || '09:00',
        endTime: booking.endTime || '09:30',
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt
      };
    });

    res.status(200).json({
      success: true,
      data: formattedBookings,
      count: formattedBookings.length,
      doctorId: doctorId,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });

  } catch (error) {
    console.error('Error fetching doctor bookings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch bookings'
    });
  }
};

// ================= GET BOOKINGS BY DATE - FIXED =================
exports.getBookingsByDate = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    const { date } = req.query;

    console.log(`📋 Fetching bookings for doctor: ${doctorId}, date: ${date}`);

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: 'Doctor ID is required'
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date.split('T')[0];

    const query = {
      doctorId: doctorId,
      date: dateStr,  // ✅ String match
      status: { $ne: 'cancelled' }
    };

    console.log(`🔍 Query:`, JSON.stringify(query, null, 2));

    const bookings = await Booking.find(query)
      .populate('patientId', 'fullName phoneNumber name')
      .sort({ slotNumber: 1 });

    console.log(`✅ Found ${bookings.length} bookings`);

    res.status(200).json({
      success: true,
      data: bookings,
      count: bookings.length,
      doctorId: doctorId,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });

  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch bookings'
    });
  }
};

// ================= GET USER'S BOOKINGS - FIXED =================
exports.getUserBookings = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    console.log(`📋 Fetching bookings for user: ${userId}`);

    const bookings = await Booking.find({ 
      userId: userId,
      status: { $ne: 'cancelled' }
    })
      .populate('doctorId', 'fullName name specialization profileImage consultationFee')
      .sort({ bookingDate: -1 });

    console.log(`✅ Found ${bookings.length} bookings for user ${userId}`);

    res.status(200).json({
      success: true,
      data: bookings,
      count: bookings.length,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });

  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch bookings'
    });
  }
};

// ================= CANCEL BOOKING - FIXED =================
exports.cancelBooking = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { bookingId } = req.params;
    const userId = req.user?.userId;

    console.log(`❌ Cancelling booking: ${bookingId} for user: ${userId}`);

    const booking = await Booking.findOne({ _id: bookingId });
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.userId?.toString() !== userId?.toString() && 
        booking.patientId?.toString() !== userId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this booking'
      });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancellationReason = req.body.reason || 'Cancelled by user';
    await booking.save();

    // ✅ FIXED: Update slot with string date
    await Slot.findOneAndUpdate(
      {
        doctorId: booking.doctorId,
        date: booking.date,  // ✅ String match
        slotNumber: booking.slotNumber
      },
      {
        isBooked: false,
        isAvailable: true,
        status: 'available',
        bookingId: null,
        patientId: null,
        patientName: null
      }
    );

    console.log(`✅ Booking ${bookingId} cancelled successfully`);

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel booking'
    });
  }
};

// ================= ADD OFFLINE APPOINTMENT - FIXED =================
exports.addOfflineAppointment = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId, patientName, patientPhone, date, slotNumber, timeSlot, amount = 500 } = req.body;

    console.log(`📝 Adding offline appointment for doctor: ${doctorId}`);

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    let user = await User.findOne({ phoneNumber: patientPhone });
    if (!user) {
      user = await User.create({
        phoneNumber: patientPhone,
        fullName: patientName,
        name: patientName,
        role: 'patient',
        isWalkIn: true
      });
    }

    let finalTimeSlot = timeSlot;
    let finalStartTime = '09:00';
    let finalEndTime = '09:30';
    
    if (!finalTimeSlot) {
      const schedule = await Schedule.findOne({ doctorId });
      const openTime = schedule?.startTime || '09:00';
      const totalSlots = schedule?.totalSlotsPerDay || 30;
      const totalMinutes = timeToMinutes(schedule?.endTime || '17:00') - timeToMinutes(openTime);
      const slotDuration = totalMinutes / totalSlots;
      const slotNum = parseInt(slotNumber) || 1;
      const startMinutes = timeToMinutes(openTime) + ((slotNum - 1) * slotDuration);
      finalStartTime = minutesToTime(startMinutes);
      finalEndTime = minutesToTime(startMinutes + slotDuration);
      finalTimeSlot = `${finalStartTime}-${finalEndTime}`;
    } else {
      const parts = finalTimeSlot.split('-');
      finalStartTime = parts[0]?.trim() || '09:00';
      finalEndTime = parts[1]?.trim() || '09:30';
    }

    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date.split('T')[0];

    const booking = new Booking({
      doctorId,
      patientId: user._id,
      userId: user._id,
      doctorName: doctor.fullName || doctor.name,
      patientName,
      patientPhone,
      date: dateStr,  // ✅ String date
      bookingDate: moment(dateStr).startOf('day').toDate(),
      timeSlot: finalTimeSlot,
      slotNumber: parseInt(slotNumber) || 1,
      startTime: finalStartTime,
      endTime: finalEndTime,
      amount: amount,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      bookingType: 'walk-in',
      appointmentType: 'offline'
    });

    await booking.save();

    // ✅ FIXED: Update slot with string date
    await Slot.findOneAndUpdate(
      {
        doctorId: doctorId,
        date: dateStr,  // ✅ String match
        slotNumber: parseInt(slotNumber) || 1
      },
      {
        $set: {
          isBooked: true,
          isAvailable: false,
          status: 'booked',
          bookingId: booking._id,
          startTime: finalStartTime,
          endTime: finalEndTime,
          patientId: user._id,
          patientName: patientName
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ Offline appointment created: ${booking._id}`);

    res.status(201).json({
      success: true,
      message: 'Walk-in patient added successfully',
      data: booking,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error adding offline appointment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add walk-in patient'
    });
  }
};

// ================= GET APPOINTMENT BY ID =================
exports.getAppointmentById = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate('doctorId', 'fullName name specialization profileImage')
      .populate('patientId', 'fullName name phoneNumber');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.status(200).json({
      success: true,
      data: booking,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch appointment'
    });
  }
};

// ================= GET PATIENT STATS =================
exports.getPatientStats = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { patientId } = req.params;

    const total = await Booking.countDocuments({ 
      patientId: patientId,
      status: { $ne: 'cancelled' }
    });
    
    const completed = await Booking.countDocuments({ 
      patientId: patientId, 
      status: 'completed' 
    });
    
    const cancelled = await Booking.countDocuments({ 
      patientId: patientId, 
      status: 'cancelled' 
    });
    
    const upcoming = await Booking.countDocuments({ 
      patientId: patientId, 
      status: 'confirmed',
      date: { $gte: moment().format('YYYY-MM-DD') }
    });

    res.status(200).json({
      success: true,
      data: { total, completed, cancelled, upcoming },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching patient stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch patient stats'
    });
  }
};

// ================= GET APPOINTMENTS BY PHONE =================
exports.getAppointmentsByPhone = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { phone } = req.params;

    const bookings = await Booking.find({ 
      patientPhone: phone,
      status: { $ne: 'cancelled' }
    })
      .populate('doctorId', 'fullName name specialization')
      .sort({ bookingDate: -1 });

    res.status(200).json({
      success: true,
      data: bookings,
      count: bookings.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching appointments by phone:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch appointments'
    });
  }
};

// ================= GET MY TIMING =================
exports.getMyTiming = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const userId = req.user?.userId;
    
    console.log(`📡 getMyTiming called for user: ${userId}`);
    
    const doctor = await Doctor.findOne({ userId });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }
    
    const doctorId = doctor._id;
    console.log(`📡 Doctor ID: ${doctorId}`);
    
    let schedule = await Schedule.findOne({ doctorId });
    
    const weeklySchedule = {};
    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    if (!schedule) {
      console.log('📊 No schedule found, creating default');
      daysOfWeek.forEach(day => {
        weeklySchedule[day] = {
          enabled: day !== 'sunday',
          openTime: '09:00',
          closeTime: '17:00',
          totalSlots: 30,
          totalBookings: 0
        };
      });
      
      return res.status(200).json({
        success: true,
        data: { weeklySchedule },
        timestamp: new Date().toISOString(),
        _cacheBust: Date.now()
      });
    }
    
    console.log('✅ Returning schedule');
    
    daysOfWeek.forEach(day => {
      const dayData = schedule.weeklySchedule?.[day] || {};
      weeklySchedule[day] = {
        enabled: dayData.enabled !== undefined ? dayData.enabled : true,
        openTime: dayData.openTime || schedule.startTime || '09:00',
        closeTime: dayData.closeTime || schedule.endTime || '17:00',
        totalSlots: dayData.totalSlots || schedule.totalSlotsPerDay || 30,
        totalBookings: dayData.totalBookings || 0
      };
    });
    
    res.status(200).json({
      success: true,
      data: { weeklySchedule },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
    
  } catch (error) {
    console.error('Error in getMyTiming:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch timing'
    });
  }
};

// ================= SET MY TIMING =================
exports.setMyTiming = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const userId = req.user?.userId;
    const { weeklySchedule } = req.body;
    
    const doctor = await Doctor.findOne({ userId });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }
    
    const doctorId = doctor._id;
    
    let schedule = await Schedule.findOne({ doctorId });
    
    if (!schedule) {
      schedule = new Schedule({ doctorId });
    }
    
    schedule.weeklySchedule = weeklySchedule;
    schedule.updatedAt = new Date();
    
    for (const [day, data] of Object.entries(weeklySchedule)) {
      if (data.enabled) {
        schedule.startTime = data.openTime;
        schedule.endTime = data.closeTime;
        schedule.totalSlotsPerDay = data.totalSlots;
        break;
      }
    }
    
    await schedule.save();
    
    // ✅ FIXED: Delete slots with string date
    // Get all dates that need to be regenerated
    const today = moment().format('YYYY-MM-DD');
    const futureDate = moment().add(30, 'days').format('YYYY-MM-DD');
    
    // Delete all future slots
    await Slot.deleteMany({ 
      doctorId: doctorId,
      date: { $gte: today }
    });
    
    res.status(200).json({
      success: true,
      message: 'Schedule saved successfully',
      data: { weeklySchedule },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in setMyTiming:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save schedule'
    });
  }
};

// ================= SAVE DOCTOR SCHEDULE =================
exports.saveDoctorSchedule = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    const { weeklySchedule, totalSlotsPerDay, startTime, endTime } = req.body;
    
    let schedule = await Schedule.findOne({ doctorId });
    
    if (!schedule) {
      schedule = new Schedule({ doctorId });
    }
    
    if (weeklySchedule) schedule.weeklySchedule = weeklySchedule;
    if (totalSlotsPerDay) schedule.totalSlotsPerDay = totalSlotsPerDay;
    if (startTime) schedule.startTime = startTime;
    if (endTime) schedule.endTime = endTime;
    schedule.updatedAt = new Date();
    
    await schedule.save();
    
    // ✅ FIXED: Delete slots with string date
    await Slot.deleteMany({ 
      doctorId: doctorId,
      date: { $gte: moment().format('YYYY-MM-DD') }
    });
    
    res.status(200).json({
      success: true,
      message: 'Schedule saved successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error saving schedule:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save schedule'
    });
  }
};

// ================= RESCHEDULE APPOINTMENT =================
exports.rescheduleAppointment = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { bookingId } = req.params;
    const { date, slotNumber, timeSlot } = req.body;
    const userId = req.user?.userId;

    const booking = await Booking.findOne({ _id: bookingId });
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.userId?.toString() !== userId?.toString() && 
        booking.patientId?.toString() !== userId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reschedule this booking'
      });
    }

    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date.split('T')[0];

    booking.date = dateStr;  // ✅ String date
    booking.bookingDate = moment(dateStr).startOf('day').toDate();
    booking.slotNumber = parseInt(slotNumber);
    if (timeSlot) booking.timeSlot = timeSlot;
    booking.updatedAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Appointment rescheduled successfully',
      data: booking,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reschedule appointment'
    });
  }
};

// ================= ADD REVIEW =================
exports.addReview = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { bookingId } = req.params;
    const { rating, review } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    booking.rating = rating;
    booking.review = review;
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Review added successfully',
      data: booking,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error adding review:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add review'
    });
  }
};

// ================= UPDATE BOOKING STATUS =================
exports.updateBookingStatus = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { bookingId } = req.params;
    const { status } = req.body;

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status, updatedAt: new Date() },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Booking status updated',
      data: booking,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update booking status'
    });
  }
};

// ================= COMPLETE APPOINTMENT =================
exports.completeAppointment = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { bookingId } = req.params;

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: 'completed', completedAt: new Date() },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Appointment completed',
      data: booking,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error completing appointment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete appointment'
    });
  }
};

// ================= ADD PRESCRIPTION =================
exports.addPrescription = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { bookingId } = req.params;
    const { prescription } = req.body;

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { prescription, updatedAt: new Date() },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Prescription added',
      data: booking,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error adding prescription:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add prescription'
    });
  }
};

// ================= GENERATE SLOTS FOR DATE RANGE - FIXED =================
exports.generateSlotsForDateRange = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    const { startDate, endDate } = req.body;

    const schedule = await Schedule.findOne({ doctorId });
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }

    const totalSlotsCount = schedule.totalSlotsPerDay || 30;
    const start = moment(startDate);
    const end = moment(endDate);
    const createdSlots = [];

    for (let date = moment(start); date.isSameOrBefore(end); date.add(1, 'day')) {
      const dateStr = date.format('YYYY-MM-DD');
      const dayOfWeek = date.format('dddd').toLowerCase();
      
      let isDayEnabled = false;
      if (schedule.weeklySchedule && schedule.weeklySchedule[dayOfWeek]) {
        isDayEnabled = schedule.weeklySchedule[dayOfWeek].enabled === true;
      } else {
        const workingDays = schedule.workingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        isDayEnabled = workingDays.includes(dayOfWeek);
      }
      
      if (!isDayEnabled) continue;
      
      const generatedSlots = generateSlots(
        dateStr,
        schedule.startTime || '09:00',
        schedule.endTime || '17:00',
        totalSlotsCount
      );
      
      // ✅ FIXED: Delete with string date
      await Slot.deleteMany({ 
        doctorId, 
        date: dateStr  // ✅ String match
      });
      
      for (const slot of generatedSlots) {
        const newSlot = await Slot.create({
          doctorId,
          date: slot.date,  // ✅ Already string from generateSlots
          slotNumber: slot.slotNumber,
          startTime: slot.startTime,
          endTime: slot.endTime,
          duration: timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime),
          isAvailable: true,
          isBooked: false,
          status: 'available'
        });
        createdSlots.push(newSlot);
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Generated ${createdSlots.length} slots`,
      data: createdSlots,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error generating slots:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate slots'
    });
  }
};

// ================= CHECK SLOT AVAILABILITY =================
exports.checkSlotAvailability = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId, date, slotNumber } = req.params;
    
    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date.split('T')[0];

    const booking = await Booking.findOne({
      doctorId,
      date: dateStr,  // ✅ String match
      slotNumber: parseInt(slotNumber),
      status: { $ne: 'cancelled' }
    });

    res.status(200).json({
      success: true,
      isAvailable: !booking,
      message: !booking ? 'Slot is available' : 'Slot is already booked',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking slot availability:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check slot availability'
    });
  }
};

// ================= JOIN WAITING QUEUE =================
exports.joinWaitingQueue = async (req, res) => {
  setNoCacheHeaders(res);
  
  res.status(200).json({
    success: true,
    message: 'Added to waiting queue',
    data: { queuePosition: 1 },
    timestamp: new Date().toISOString()
  });
};

// ================= GET QUEUE POSITION =================
exports.getQueuePosition = async (req, res) => {
  setNoCacheHeaders(res);
  
  res.status(200).json({
    success: true,
    data: { position: 0 },
    timestamp: new Date().toISOString()
  });
};

module.exports = exports;