const express = require('express');
const router = express.Router();
const Schedule = require('../models/Schedule');
const Doctor = require('../models/Doctor');
const jwt = require('jsonwebtoken');

// Auth middleware
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = {
      _id: decoded.userId || decoded._id || decoded.id,
      ...decoded
    };
    
    if (!req.user._id) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ============ PATIENT ROUTE - Get doctor schedule by ID ============
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    console.log('📡 Get schedule for doctor (patient view):', doctorId);
    
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    let schedule = await Schedule.findOne({ doctorId: doctorId });
    
    if (!schedule) {
      // ============ FIXED: ALL DAYS CLOSED ============
      const defaultDayTimes = {
        monday: { openTime: '09:00', closeTime: '18:00' },
        tuesday: { openTime: '09:00', closeTime: '18:00' },
        wednesday: { openTime: '09:00', closeTime: '18:00' },
        thursday: { openTime: '09:00', closeTime: '18:00' },
        friday: { openTime: '09:00', closeTime: '18:00' },
        saturday: { openTime: '09:00', closeTime: '18:00' },
        sunday: { openTime: '09:00', closeTime: '18:00' }
      };
      
      schedule = new Schedule({
        doctorId: doctorId,
        workingDays: [], // ============ EMPTY = all days closed ============
        startTime: '09:00',
        endTime: '18:00',
        dayTimes: defaultDayTimes,
        totalSlotsPerDay: 30,
        isActive: false,
        status: 'inactive'
      });
      await schedule.save();
      console.log('✅ Created default schedule (all days closed)');
    }
    
    if (!schedule.dayTimes) {
      const defaultDayTimes = {
        monday: { openTime: '09:00', closeTime: '18:00' },
        tuesday: { openTime: '09:00', closeTime: '18:00' },
        wednesday: { openTime: '09:00', closeTime: '18:00' },
        thursday: { openTime: '09:00', closeTime: '18:00' },
        friday: { openTime: '09:00', closeTime: '18:00' },
        saturday: { openTime: '09:00', closeTime: '18:00' },
        sunday: { openTime: '09:00', closeTime: '18:00' }
      };
      schedule.dayTimes = defaultDayTimes;
      await schedule.save();
    }
    
    const dayMap = {
      'monday': 'Monday',
      'tuesday': 'Tuesday',
      'wednesday': 'Wednesday',
      'thursday': 'Thursday',
      'friday': 'Friday',
      'saturday': 'Saturday',
      'sunday': 'Sunday'
    };
    
    const weeklySchedule = {};
    Object.keys(dayMap).forEach(dayKey => {
      const dayName = dayMap[dayKey];
      const dayTime = schedule.dayTimes[dayKey] || {};
      weeklySchedule[dayKey] = {
        enabled: schedule.workingDays?.includes(dayName) || false,
        openTime: dayTime.openTime || schedule.startTime || '09:00',
        closeTime: dayTime.closeTime || schedule.endTime || '18:00'
      };
    });
    
    console.log('📤 Returning schedule for patient view');
    
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
    console.error('❌ GET Doctor Schedule Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ DOCTOR ROUTES (Authenticated) ============

// GET /api/schedules/my-timing - Get doctor's own schedule
router.get('/my-timing', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('📡 Get schedule for user:', userId);
    
    const doctor = await Doctor.findOne({ userId: userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    let schedule = await Schedule.findOne({ doctorId: doctor._id });
    
    if (!schedule) {
      // ============ FIXED: ALL DAYS CLOSED ============
      const defaultDayTimes = {
        monday: { openTime: '09:00', closeTime: '18:00' },
        tuesday: { openTime: '09:00', closeTime: '18:00' },
        wednesday: { openTime: '09:00', closeTime: '18:00' },
        thursday: { openTime: '09:00', closeTime: '18:00' },
        friday: { openTime: '09:00', closeTime: '18:00' },
        saturday: { openTime: '09:00', closeTime: '18:00' },
        sunday: { openTime: '09:00', closeTime: '18:00' }
      };
      
      schedule = new Schedule({
        doctorId: doctor._id,
        workingDays: [], // ============ EMPTY = all days closed ============
        startTime: '09:00',
        endTime: '18:00',
        dayTimes: defaultDayTimes,
        totalSlotsPerDay: 30,
        isActive: false,
        status: 'inactive'
      });
      await schedule.save();
      console.log('✅ Created default schedule (all days closed)');
    }
    
    if (!schedule.dayTimes) {
      const defaultDayTimes = {
        monday: { openTime: '09:00', closeTime: '18:00' },
        tuesday: { openTime: '09:00', closeTime: '18:00' },
        wednesday: { openTime: '09:00', closeTime: '18:00' },
        thursday: { openTime: '09:00', closeTime: '18:00' },
        friday: { openTime: '09:00', closeTime: '18:00' },
        saturday: { openTime: '09:00', closeTime: '18:00' },
        sunday: { openTime: '09:00', closeTime: '18:00' }
      };
      schedule.dayTimes = defaultDayTimes;
      await schedule.save();
    }
    
    const dayMap = {
      'monday': 'Monday',
      'tuesday': 'Tuesday',
      'wednesday': 'Wednesday',
      'thursday': 'Thursday',
      'friday': 'Friday',
      'saturday': 'Saturday',
      'sunday': 'Sunday'
    };
    
    const weeklySchedule = {};
    Object.keys(dayMap).forEach(dayKey => {
      const dayName = dayMap[dayKey];
      const dayTime = schedule.dayTimes[dayKey] || {};
      weeklySchedule[dayKey] = {
        enabled: schedule.workingDays?.includes(dayName) || false,
        openTime: dayTime.openTime || schedule.startTime || '09:00',
        closeTime: dayTime.closeTime || schedule.endTime || '18:00'
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
    
  } catch (error) {
    console.error('❌ GET Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ FIXED: POST /api/schedules/my-timing - Save doctor's schedule ============
router.post('/my-timing', authMiddleware, async (req, res) => {
  try {
    console.log('📝 POST /my-timing CALLED!');
    
    const userId = req.user._id;
    console.log('📝 User ID:', userId);
    
    const { weeklySchedule } = req.body;
    console.log('📊 Received data:', JSON.stringify(weeklySchedule, null, 2));
    
    if (!weeklySchedule) {
      return res.status(400).json({ 
        success: false, 
        message: 'weeklySchedule is required' 
      });
    }
    
    const doctor = await Doctor.findOne({ userId: userId });
    if (!doctor) {
      return res.status(404).json({ 
        success: false, 
        message: 'Doctor not found' 
      });
    }
    console.log('👨‍⚕️ Doctor ID:', doctor._id);
    
    const dayMap = {
      'monday': 'Monday',
      'tuesday': 'Tuesday',
      'wednesday': 'Wednesday',
      'thursday': 'Thursday',
      'friday': 'Friday',
      'saturday': 'Saturday',
      'sunday': 'Sunday'
    };
    
    const workingDays = [];
    const dayTimes = {};
    let startTime = '09:00';
    let endTime = '18:00';
    
    // ============ FIXED: Only add days that are enabled ============
    Object.keys(weeklySchedule).forEach(dayKey => {
      const day = weeklySchedule[dayKey];
      const dayName = dayMap[dayKey];
      
      // Always store times for all days
      dayTimes[dayKey] = {
        openTime: day?.openTime || '09:00',
        closeTime: day?.closeTime || '18:00'
      };
      
      // ============ FIXED: Only add to workingDays if enabled ============
      if (day?.enabled === true) {
        workingDays.push(dayName);
        if (day.openTime) startTime = day.openTime;
        if (day.closeTime) endTime = day.closeTime;
      }
    });
    
    // ============ FIXED: If no days enabled, keep workingDays empty ============
    // Don't add default days if none are selected
    console.log('📅 Working Days:', workingDays);
    console.log('📅 Day Times:', JSON.stringify(dayTimes, null, 2));
    
    let schedule = await Schedule.findOne({ doctorId: doctor._id });
    
    if (!schedule) {
      schedule = new Schedule({
        doctorId: doctor._id,
        workingDays,
        startTime,
        endTime,
        dayTimes,
        totalSlotsPerDay: 30,
        isActive: workingDays.length > 0,
        status: workingDays.length > 0 ? 'active' : 'inactive'
      });
      console.log('📝 Creating new schedule');
    } else {
      schedule.workingDays = workingDays;
      schedule.startTime = startTime;
      schedule.endTime = endTime;
      schedule.dayTimes = dayTimes;
      schedule.isActive = workingDays.length > 0;
      schedule.status = workingDays.length > 0 ? 'active' : 'inactive';
      schedule.updatedAt = new Date();
      console.log('📝 Updating existing schedule');
    }
    
    await schedule.save();
    console.log('✅ Schedule saved successfully!');
    
    // Build response with per-day times
    const updatedWeeklySchedule = {};
    Object.keys(dayMap).forEach(dayKey => {
      const dayName = dayMap[dayKey];
      const dayTime = dayTimes[dayKey] || {};
      updatedWeeklySchedule[dayKey] = {
        enabled: workingDays.includes(dayName),
        openTime: dayTime.openTime || startTime || '09:00',
        closeTime: dayTime.closeTime || endTime || '18:00'
      };
    });
    
    res.status(200).json({
      success: true,
      message: 'Schedule saved successfully',
      data: {
        weeklySchedule: updatedWeeklySchedule,
        workingDays,
        startTime,
        endTime,
        updatedAt: schedule.updatedAt
      }
    });
    
  } catch (error) {
    console.error('❌ POST Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;