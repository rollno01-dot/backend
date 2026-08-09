const Schedule = require('../models/Schedule');
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const Doctor = require('../models/Doctor');
const moment = require('moment');

// ================= HELPER FUNCTIONS =================

const timeToMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const formatTimeDisplay = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  if (isNaN(hour)) return time;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
};

const generateExactSlots = (date, startTime, endTime, totalSlotsCount) => {
  const slots = [];
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const totalMinutes = endMinutes - startMinutes;
  const slotDuration = totalMinutes / totalSlotsCount;
  
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
      date: date,
      isAvailable: true,
      isBooked: false,
      status: 'available',
      expectedTime: `${formatTimeDisplay(startTimeStr)} - ${formatTimeDisplay(endTimeStr)}`
    });
  }
  
  return slots;
};

const getDefaultDaySchedule = () => {
  return {
    enabled: false,
    openTime: '09:00',
    closeTime: '18:00'
  };
};

const getDefaultWeeklySchedule = () => {
  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const defaultSchedule = {};
  daysOfWeek.forEach(day => {
    defaultSchedule[day] = getDefaultDaySchedule();
  });
  return defaultSchedule;
};

// ================= GET MY TIMING =================
exports.getMyTiming = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    console.log('📡 getMyTiming called for user:', userId);
    
    const doctor = await Doctor.findOne({ userId });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }
    
    const doctorId = doctor._id;
    console.log('📡 Doctor ID:', doctorId);
    
    let schedule = await Schedule.findOne({ doctorId });
    
    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    if (!schedule) {
      console.log('No schedule found, returning default empty schedule');
      const weeklySchedule = getDefaultWeeklySchedule();
      
      return res.status(200).json({
        success: true,
        data: {
          weeklySchedule,
          totalSlotsPerDay: 30,
          startTime: '09:00',
          endTime: '18:00',
          updatedAt: new Date()
        }
      });
    }
    
    const weeklySchedule = {};
    
    let scheduleData = {};
    if (schedule.weeklySchedule) {
      if (typeof schedule.weeklySchedule === 'object') {
        if (schedule.weeklySchedule.toObject) {
          scheduleData = schedule.weeklySchedule.toObject();
        } else {
          scheduleData = schedule.weeklySchedule;
        }
      }
    }
    
    daysOfWeek.forEach(day => {
      const daySchedule = scheduleData[day] || {};
      
      weeklySchedule[day] = {
        enabled: daySchedule.enabled === true,
        openTime: daySchedule.openTime || '09:00',
        closeTime: daySchedule.closeTime || '18:00'
      };
    });
    
    console.log('✅ Returning schedule with day-specific data');
    
    res.status(200).json({
      success: true,
      data: {
        weeklySchedule,
        totalSlotsPerDay: schedule.totalSlotsPerDay || 30,
        startTime: schedule.startTime || '09:00',
        endTime: schedule.endTime || '18:00',
        updatedAt: schedule.updatedAt
      }
    });
    
  } catch (error) {
    console.error('Error in getMyTiming:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch timing'
    });
  }
};

// ================= SET MY TIMING (COMPLETELY FIXED) =================
exports.setMyTiming = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { weeklySchedule } = req.body;
    
    console.log('💾 setMyTiming called for user:', userId);
    console.log('📊 Received weeklySchedule:', JSON.stringify(weeklySchedule, null, 2));
    
    const doctor = await Doctor.findOne({ userId });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }
    
    const doctorId = doctor._id;
    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    // ✅ FIX: Build the schedule data directly from received data
    const scheduleData = {};
    daysOfWeek.forEach(day => {
      if (weeklySchedule && weeklySchedule[day]) {
        scheduleData[day] = {
          enabled: weeklySchedule[day].enabled === true,
          openTime: weeklySchedule[day].openTime || '09:00',
          closeTime: weeklySchedule[day].closeTime || '18:00'
        };
      } else {
        scheduleData[day] = {
          enabled: false,
          openTime: '09:00',
          closeTime: '18:00'
        };
      }
    });
    
    console.log('📊 Processed scheduleData:', JSON.stringify(scheduleData, null, 2));
    
    // ✅ FIX: Use findOneAndUpdate with upsert to ensure it saves
    const updatedSchedule = await Schedule.findOneAndUpdate(
      { doctorId },
      {
        doctorId,
        weeklySchedule: scheduleData,
        startTime: '09:00',
        endTime: '18:00',
        totalSlotsPerDay: 30,
        updatedAt: new Date()
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );
    
    console.log('✅ Schedule saved successfully');
    console.log('📊 Saved schedule:', JSON.stringify(updatedSchedule.weeklySchedule, null, 2));
    
    // ✅ Verify Wednesday specifically
    if (updatedSchedule.weeklySchedule && updatedSchedule.weeklySchedule.wednesday) {
      const wed = updatedSchedule.weeklySchedule.wednesday;
      console.log(`📊 Wednesday in DB: enabled=${wed.enabled}, open=${wed.openTime}, close=${wed.closeTime}`);
    }
    
    // Clear slots for regeneration
    await Slot.deleteMany({ doctorId });
    console.log('🗑️ Cleared existing slots for regeneration');
    
    res.status(200).json({
      success: true,
      message: 'Timing updated successfully',
      data: {
        updatedAt: updatedSchedule.updatedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error in setMyTiming:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to set timing'
    });
  }
};

// ================= GET AVAILABLE SLOTS =================
exports.getAvailableSlots = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;
    
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
      return res.status(404).json({
        success: false,
        message: 'Doctor schedule not found'
      });
    }
    
    let isWorkingDay = false;
    let openTime = '09:00';
    let closeTime = '18:00';
    let totalSlotsCount = 30;
    
    let scheduleData = {};
    if (schedule.weeklySchedule) {
      if (typeof schedule.weeklySchedule === 'object') {
        if (schedule.weeklySchedule.toObject) {
          scheduleData = schedule.weeklySchedule.toObject();
        } else {
          scheduleData = schedule.weeklySchedule;
        }
      }
    }
    
    if (scheduleData[dayOfWeek]) {
      const dayData = scheduleData[dayOfWeek];
      isWorkingDay = dayData.enabled === true;
      if (dayData.openTime) openTime = dayData.openTime;
      if (dayData.closeTime) closeTime = dayData.closeTime;
      console.log(`Day ${dayOfWeek} - Enabled: ${isWorkingDay}`);
    } else {
      const dayName = moment(selectedDate).format('dddd');
      isWorkingDay = schedule.workingDays?.includes(dayName) || false;
      openTime = schedule.startTime || '09:00';
      closeTime = schedule.endTime || '18:00';
    }
    
    if (!isWorkingDay) {
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
        }
      });
    }
    
    let slots = await Slot.find({
      doctorId,
      date: new Date(selectedDate)
    }).sort('slotNumber');
    
    if (slots.length === 0) {
      console.log(`No slots found, generating ${totalSlotsCount} slots...`);
      const generatedSlots = generateExactSlots(
        selectedDate,
        openTime,
        closeTime,
        totalSlotsCount
      );
      
      const slotDocs = generatedSlots.map(slot => ({
        doctorId,
        date: new Date(slot.date),
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
        console.log(`✅ Generated ${slots.length} slots`);
      }
    }
    
    const bookedAppointments = await Booking.find({
      doctorId,
      bookingDate: {
        $gte: moment(selectedDate).startOf('day').toDate(),
        $lt: moment(selectedDate).endOf('day').toDate()
      },
      status: { $in: ['confirmed', 'pending'] }
    });
    
    const bookedSlotNumbers = new Set(bookedAppointments.map(b => b.slotNumber));
    const now = moment();
    
    const formattedSlots = slots.map(slot => {
      const slotDateTime = moment(`${selectedDate} ${slot.startTime}`, 'YYYY-MM-DD HH:mm');
      const isPast = slotDateTime.isBefore(now);
      const isBooked = bookedSlotNumbers.has(slot.slotNumber);
      
      return {
        slotNumber: slot.slotNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        expectedTime: `${formatTimeDisplay(slot.startTime)} - ${formatTimeDisplay(slot.endTime)}`,
        isBooked: isBooked,
        isAvailable: !isBooked && !isPast,
        status: isBooked ? 'booked' : (isPast ? 'past' : 'available'),
        isPast: isPast,
        duration: slot.duration
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
        slots: formattedSlots,
        totalSlots: totalSlotsCount,
        availableCount: stats.available,
        isWorkingDay: true,
        date: selectedDate,
        openTime: openTime,
        closeTime: closeTime,
        slotDuration: totalSlotsCount > 0 ? (timeToMinutes(closeTime) - timeToMinutes(openTime)) / totalSlotsCount : 0,
        stats: stats
      }
    });
    
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch available slots'
    });
  }
};

// ================= GET DOCTOR'S SCHEDULE =================
exports.getDoctorSchedule = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;
    
    let schedule = await Schedule.findOne({ doctorId });
    
    let scheduleData = {};
    if (schedule && schedule.weeklySchedule) {
      if (typeof schedule.weeklySchedule === 'object') {
        if (schedule.weeklySchedule.toObject) {
          scheduleData = schedule.weeklySchedule.toObject();
        } else {
          scheduleData = schedule.weeklySchedule;
        }
      }
    }
    
    if (!schedule) {
      const defaultSchedule = getDefaultWeeklySchedule();
      return res.status(200).json({
        success: true,
        data: {
          weeklySchedule: defaultSchedule,
          totalSlotsPerDay: 30,
          startTime: '09:00',
          endTime: '18:00',
          updatedAt: new Date()
        }
      });
    }
    
    if (date) {
      const selectedDate = moment(date).format('YYYY-MM-DD');
      const dayOfWeek = moment(selectedDate).format('dddd').toLowerCase();
      
      let isWorkingDay = false;
      let openTime = '09:00';
      let closeTime = '18:00';
      let totalSlotsCount = 30;
      
      if (scheduleData[dayOfWeek]) {
        const dayData = scheduleData[dayOfWeek];
        isWorkingDay = dayData.enabled === true;
        if (dayData.openTime) openTime = dayData.openTime;
        if (dayData.closeTime) closeTime = dayData.closeTime;
      } else {
        isWorkingDay = schedule.workingDays?.includes(moment(selectedDate).format('dddd')) || false;
        openTime = schedule.startTime || '09:00';
        closeTime = schedule.endTime || '18:00';
      }
      
      let slots = await Slot.find({
        doctorId,
        date: new Date(selectedDate)
      }).sort('slotNumber');
      
      if (slots.length === 0 && isWorkingDay) {
        const generatedSlots = generateExactSlots(
          selectedDate,
          openTime,
          closeTime,
          totalSlotsCount
        );
        
        const slotDocs = generatedSlots.map(slot => ({
          doctorId,
          date: new Date(slot.date),
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
      
      const bookedAppointments = await Booking.find({
        doctorId,
        bookingDate: {
          $gte: moment(selectedDate).startOf('day').toDate(),
          $lt: moment(selectedDate).endOf('day').toDate()
        },
        status: { $in: ['confirmed', 'pending'] }
      });
      
      const bookedSlotNumbers = new Set(bookedAppointments.map(b => b.slotNumber));
      const now = moment();
      
      const formattedSlots = slots.map(slot => {
        const slotDateTime = moment(`${selectedDate} ${slot.startTime}`, 'YYYY-MM-DD HH:mm');
        const isPast = slotDateTime.isBefore(now);
        const isBooked = bookedSlotNumbers.has(slot.slotNumber);
        
        return {
          slotNumber: slot.slotNumber,
          startTime: slot.startTime,
          endTime: slot.endTime,
          expectedTime: `${formatTimeDisplay(slot.startTime)} - ${formatTimeDisplay(slot.endTime)}`,
          isBooked: isBooked,
          isAvailable: !isBooked && !isPast,
          status: isBooked ? 'booked' : (isPast ? 'past' : 'available'),
          isPast: isPast
        };
      });
      
      res.status(200).json({
        success: true,
        data: {
          date: selectedDate,
          openTime: openTime,
          closeTime: closeTime,
          totalSlots: totalSlotsCount,
          slots: formattedSlots,
          isWorkingDay,
          stats: {
            total: formattedSlots.length,
            available: formattedSlots.filter(s => s.isAvailable).length,
            booked: formattedSlots.filter(s => s.isBooked).length
          }
        }
      });
    } else {
      const weeklySchedule = {};
      const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      
      daysOfWeek.forEach(day => {
        const dayData = scheduleData[day] || {};
        weeklySchedule[day] = {
          enabled: dayData.enabled === true,
          openTime: dayData.openTime || schedule.startTime || '09:00',
          closeTime: dayData.closeTime || schedule.endTime || '18:00'
        };
      });
      
      res.status(200).json({
        success: true,
        data: {
          weeklySchedule,
          totalSlotsPerDay: schedule.totalSlotsPerDay || 30,
          startTime: schedule.startTime || '09:00',
          endTime: schedule.endTime || '18:00',
          updatedAt: schedule.updatedAt
        }
      });
    }
    
  } catch (error) {
    console.error('Error in getDoctorSchedule:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch schedule'
    });
  }
};

// ================= UPDATE DOCTOR'S SCHEDULE =================
exports.updateDoctorSchedule = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { weeklySchedule } = req.body;
    
    if (!weeklySchedule) {
      return res.status(400).json({
        success: false,
        message: 'weeklySchedule is required'
      });
    }
    
    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    // Build schedule data
    const scheduleData = {};
    daysOfWeek.forEach(day => {
      if (weeklySchedule[day]) {
        scheduleData[day] = {
          enabled: weeklySchedule[day].enabled === true,
          openTime: weeklySchedule[day].openTime || '09:00',
          closeTime: weeklySchedule[day].closeTime || '18:00'
        };
      } else {
        scheduleData[day] = {
          enabled: false,
          openTime: '09:00',
          closeTime: '18:00'
        };
      }
    });
    
    const updatedSchedule = await Schedule.findOneAndUpdate(
      { doctorId },
      {
        doctorId,
        weeklySchedule: scheduleData,
        startTime: '09:00',
        endTime: '18:00',
        totalSlotsPerDay: 30,
        updatedAt: new Date()
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );
    
    await Slot.deleteMany({ doctorId });
    
    res.status(200).json({
      success: true,
      message: 'Schedule updated successfully',
      data: { 
        weeklySchedule: updatedSchedule.weeklySchedule, 
        updatedAt: updatedSchedule.updatedAt 
      }
    });
    
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update schedule'
    });
  }
};

// ================= TOGGLE SLOT AVAILABILITY =================
exports.toggleSlotAvailability = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { action } = req.body;
    
    const slot = await Slot.findById(slotId);
    
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'Slot not found'
      });
    }
    
    if (slot.isBooked) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify booked slot'
      });
    }
    
    slot.isAvailable = action === 'unblock';
    slot.status = action === 'unblock' ? 'available' : 'blocked';
    await slot.save();
    
    res.status(200).json({
      success: true,
      message: `Slot ${action === 'block' ? 'blocked' : 'unblocked'} successfully`,
      slot
    });
    
  } catch (error) {
    console.error('Error toggling slot:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to toggle slot'
    });
  }
};

// ================= BULK CREATE SLOTS =================
exports.bulkCreateSlots = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { startDate, endDate } = req.body;
    
    const schedule = await Schedule.findOne({ doctorId });
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Doctor schedule not found'
      });
    }
    
    const start = moment(startDate);
    const end = moment(endDate);
    const createdSlots = [];
    
    let scheduleData = {};
    if (schedule.weeklySchedule) {
      if (typeof schedule.weeklySchedule === 'object') {
        if (schedule.weeklySchedule.toObject) {
          scheduleData = schedule.weeklySchedule.toObject();
        } else {
          scheduleData = schedule.weeklySchedule;
        }
      }
    }
    
    for (let date = moment(start); date.isSameOrBefore(end); date.add(1, 'day')) {
      const dateStr = date.format('YYYY-MM-DD');
      const dayOfWeek = date.format('dddd').toLowerCase();
      
      let isEnabled = false;
      let openTime = schedule.startTime || '09:00';
      let closeTime = schedule.endTime || '18:00';
      let slotCount = schedule.totalSlotsPerDay || 30;
      
      if (scheduleData[dayOfWeek]) {
        const dayData = scheduleData[dayOfWeek];
        isEnabled = dayData.enabled === true;
        if (dayData.openTime) openTime = dayData.openTime;
        if (dayData.closeTime) closeTime = dayData.closeTime;
      } else {
        isEnabled = schedule.workingDays?.includes(moment(dateStr).format('dddd')) || false;
      }
      
      if (!isEnabled) continue;
      
      const generatedSlots = generateExactSlots(
        dateStr,
        openTime,
        closeTime,
        slotCount
      );
      
      for (const slot of generatedSlots) {
        const newSlot = await Slot.findOneAndUpdate(
          {
            doctorId,
            date: new Date(dateStr),
            slotNumber: slot.slotNumber
          },
          {
            doctorId,
            date: new Date(dateStr),
            slotNumber: slot.slotNumber,
            startTime: slot.startTime,
            endTime: slot.endTime,
            duration: timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime),
            isAvailable: true,
            isBooked: false,
            status: 'available'
          },
          { upsert: true, new: true }
        );
        createdSlots.push(newSlot);
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Created ${createdSlots.length} slots`,
      slots: createdSlots
    });
    
  } catch (error) {
    console.error('Error bulk creating slots:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create slots'
    });
  }
};

module.exports = exports;