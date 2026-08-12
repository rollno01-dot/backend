// Backend/src/controllers/doctor.controller.js - COMPLETE FIXED VERSION
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const Schedule = require('../models/Schedule');
const Subscription = require('../models/Subscription');
const PaymentRequest = require('../models/PaymentRequest');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// ================= NO-CACHE HELPER =================
const setNoCacheHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
};

// ============== HELPER FUNCTIONS ==============

// ============== FIXED: getFullImageUrl ==============
const getFullImageUrl = (imagePath) => {
  if (!imagePath) return null;
  
  // If it's already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // Remove leading slash if exists
  let cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
  
  // For production on Render
  if (process.env.NODE_ENV === 'production') {
    const baseUrl = process.env.BASE_URL || 'https://backend-1-mx86.onrender.com';
    return `${baseUrl}/${cleanPath}`;
  }
  
  // For development
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  return `${baseUrl}/${cleanPath}`;
};

// ============== FIXED: formatImageUrl ==============
const formatImageUrl = (imagePath, req) => {
  if (!imagePath) return null;
  
  // If it's already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // If it's a placeholder or invalid
  if (imagePath.includes('via.placeholder.com') || 
      imagePath.includes('placeholder') ||
      imagePath === 'No image' ||
      imagePath === 'null' ||
      imagePath === 'undefined') {
    return null;
  }
  
  // Remove leading slash
  let cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
  
  // For production on Render
  if (process.env.NODE_ENV === 'production') {
    const baseUrl = process.env.BASE_URL || 'https://backend-1-mx86.onrender.com';
    return `${baseUrl}/${cleanPath}`;
  }
  
  // For development
  const baseUrl = process.env.BASE_URL || (req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:5000');
  
  // If it's a full path with uploads
  if (cleanPath.startsWith('uploads/')) {
    return `${baseUrl}/${cleanPath}`;
  }
  
  // If it's just a filename
  if (!cleanPath.includes('/')) {
    return `${baseUrl}/uploads/profiles/${cleanPath}`;
  }
  
  return `${baseUrl}/${cleanPath}`;
};

const calculateRatingDistribution = (reviews) => {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  
  reviews.forEach(review => {
    const rating = review.rating;
    if (rating >= 1 && rating <= 5) {
      distribution[rating]++;
      sum += rating;
    }
  });
  
  const average = reviews.length > 0 ? sum / reviews.length : 0;
  
  return {
    average: parseFloat(average.toFixed(1)),
    total: reviews.length,
    distribution
  };
};

const checkDoctorAccess = (doctor, req) => {
  if (req.user.role === 'admin') {
    return true;
  }
  
  const requestingUserId = req.user.userId || req.user.id;
  const doctorUserId = doctor.userId ? doctor.userId.toString() : null;
  
  return doctorUserId === requestingUserId;
};

const generateTimeSlots = (date, startTime, endTime, slotDuration = 30, lunchBreak = null) => {
  const slots = [];
  const start = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm');
  const end = moment(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm');
  
  let current = moment(start);
  let slotNumber = 1;
  
  while (current < end) {
    const slotEnd = moment(current).add(slotDuration, 'minutes');
    
    if (lunchBreak && lunchBreak.start && lunchBreak.end) {
      const lunchStart = moment(`${date} ${lunchBreak.start}`, 'YYYY-MM-DD HH:mm');
      const lunchEnd = moment(`${date} ${lunchBreak.end}`, 'YYYY-MM-DD HH:mm');
      
      if (current.isBetween(lunchStart, lunchEnd, null, '[)') || 
          (current.isBefore(lunchStart) && slotEnd.isAfter(lunchStart))) {
        current = moment(lunchEnd);
        continue;
      }
    }
    
    if (slotEnd <= end) {
      slots.push({
        slotNumber: slotNumber++,
        startTime: current.format('HH:mm'),
        endTime: slotEnd.format('HH:mm'),
        date: date,
        isAvailable: true,
        status: 'available'
      });
    }
    
    current = slotEnd;
  }
  
  return slots;
};

// ============== REVIEW FUNCTIONS ==============

exports.getDoctorReviews = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const query = {
      doctorId: doctor._id,
      status: 'completed',
      rating: { $exists: true, $ne: null }
    };
    
    const total = await Booking.countDocuments(query);
    const reviews = await Booking.find(query)
      .select('patientName patientPhone rating review createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDoctorReviews:', error);
    next(error);
  }
};

exports.getDoctorReviewsStats = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const reviews = await Booking.find({
      doctorId: doctor._id,
      status: 'completed',
      rating: { $exists: true, $ne: null }
    }).select('rating');
    
    const stats = calculateRatingDistribution(reviews);
    
    res.status(200).json({ 
      success: true, 
      data: stats,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDoctorReviewsStats:', error);
    next(error);
  }
};

// ============== PUBLIC DOCTOR LISTING - FIXED ==============

exports.getDoctorsList = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const query = { isApproved: true, approvalStatus: 'approved' };
    const { specialization, search, limit = 999, page = 1 } = req.query;

    if (specialization && specialization !== 'All') {
      query.specialization = specialization;
    }

    if (search && search.trim()) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { specialization: { $regex: search, $options: 'i' } },
        { clinicName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Doctor.countDocuments(query);

    const doctors = await Doctor.find(query)
      .select({
        fullName: 1, specialization: 1, qualification: 1, experience: 1,
        consultationFee: 1, profileImage: 1, clinicName: 1, clinicAddress: 1,
        availableDays: 1, timeSlots: 1, rating: 1, totalReviews: 1,
        weeklySchedule: 1
      })
      .sort({ rating: -1, fullName: 1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    console.log(`📊 Found ${doctors.length} doctors (total: ${total})`);

    const doctorsWithRatings = await Promise.all(doctors.map(async (doctor) => {
      const reviews = await Booking.find({
        doctorId: doctor._id,
        status: 'completed',
        rating: { $exists: true, $ne: null }
      }).select('rating');
      
      const stats = calculateRatingDistribution(reviews);
      const formattedImage = formatImageUrl(doctor.profileImage, req);
      
      // Check availability
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      let isAvailableToday = false;
      
      if (doctor.timeSlots && Array.isArray(doctor.timeSlots)) {
        const todaySlot = doctor.timeSlots.find(slot => slot.day === today);
        if (todaySlot && todaySlot.slots && todaySlot.slots.length > 0) {
          isAvailableToday = true;
        }
      }
      
      if (!isAvailableToday && doctor.availableDays && Array.isArray(doctor.availableDays)) {
        if (doctor.availableDays.includes(today)) {
          isAvailableToday = true;
        }
      }
      
      if (!isAvailableToday && doctor.weeklySchedule) {
        const dayOfWeek = today.toLowerCase();
        if (doctor.weeklySchedule[dayOfWeek] && doctor.weeklySchedule[dayOfWeek].enabled === true) {
          isAvailableToday = true;
        }
      }
      
      if (!isAvailableToday) {
        const hasWorkingDays = (doctor.availableDays && doctor.availableDays.length > 0) ||
                               (doctor.timeSlots && doctor.timeSlots.length > 0) ||
                               (doctor.weeklySchedule && Object.keys(doctor.weeklySchedule).length > 0);
        
        if (!hasWorkingDays) {
          isAvailableToday = true;
        }
      }
      
      let todaySlots = [];
      if (isAvailableToday && doctor.timeSlots) {
        const todaySlot = doctor.timeSlots.find(slot => slot.day === today);
        todaySlots = todaySlot?.slots || [];
      }

      return {
        _id: doctor._id,
        id: doctor._id,
        name: doctor.fullName,
        fullName: doctor.fullName,
        specialization: doctor.specialization,
        specialty: doctor.specialization,
        qualification: doctor.qualification,
        experience: doctor.experience,
        consultationFee: doctor.consultationFee,
        fee: doctor.consultationFee,
        clinicName: doctor.clinicName,
        hospital: doctor.clinicName,
        clinicAddress: doctor.clinicAddress,
        profileImage: formattedImage,
        rating: stats.average || doctor.rating || 4.5,
        totalReviews: stats.total || doctor.totalReviews || 0,
        ratingDistribution: stats.distribution,
        isAvailableToday: isAvailableToday,
        todaySlots: todaySlots.slice(0, 3),
        hasSlotsToday: todaySlots.length > 0,
        availableDays: doctor.availableDays,
        timeSlots: doctor.timeSlots,
        weeklySchedule: doctor.weeklySchedule
      };
    }));

    const specializations = await Doctor.distinct('specialization', { isApproved: true });

    res.status(200).json({
      success: true,
      data: doctorsWithRatings,
      pagination: {
        total, 
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      },
      filters: { specializations: specializations.filter(s => s && s !== 'All') },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDoctorsList:', error);
    next(error);
  }
};

exports.getAllDoctors = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctors = await Doctor.find({})
      .populate('userId', 'fullName email phoneNumber isApproved role profileImage')
      .lean();
    
    const formattedDoctors = doctors.map(doctor => ({
      ...doctor,
      profileImage: formatImageUrl(doctor.profileImage, req)
    }));
    
    res.status(200).json({ 
      success: true, 
      count: formattedDoctors.length, 
      data: formattedDoctors,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getAllDoctors:', error);
    next(error);
  }
};

exports.debugDoctor = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    
    let doctor = await Doctor.findById(doctorId).lean();
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId }).lean();
    }
    
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const user = await User.findById(doctor.userId).lean();
    
    res.json({
      success: true,
      doctor: {
        id: doctor._id,
        name: doctor.fullName,
        specialization: doctor.specialization,
        isApproved: doctor.isApproved,
        approvalStatus: doctor.approvalStatus,
        profileImage: formatImageUrl(doctor.profileImage, req),
        userId: doctor.userId
      },
      user: user ? {
        id: user._id,
        name: user.fullName,
        phone: user.phoneNumber,
        role: user.role
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDoctorPublic = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    
    const doctor = await Doctor.findOne({ _id: doctorId, isApproved: true }).select({
      fullName: 1, specialization: 1, qualification: 1, experience: 1,
      consultationFee: 1, profileImage: 1, clinicName: 1, clinicAddress: 1,
      availableDays: 1, timeSlots: 1, rating: 1, totalReviews: 1
    }).lean();

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const reviews = await Booking.find({
      doctorId: doctor._id,
      status: 'completed',
      rating: { $exists: true, $ne: null }
    }).select('rating review patientName createdAt');
    
    const stats = calculateRatingDistribution(reviews);

    const formattedDoctor = {
      ...doctor,
      profileImage: formatImageUrl(doctor.profileImage, req),
      rating: stats.average,
      totalReviews: stats.total,
      ratingDistribution: stats.distribution,
      recentReviews: reviews.slice(0, 5)
    };

    res.status(200).json({ 
      success: true, 
      data: formattedDoctor,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    next(error);
  }
};

exports.checkDoctorProfile = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    
    res.status(200).json({
      exists: !!doctor,
      profile: doctor ? {
        id: doctor._id,
        name: doctor.fullName,
        specialization: doctor.specialization,
        isApproved: doctor.isApproved,
        approvalStatus: doctor.approvalStatus,
        profileImage: formatImageUrl(doctor.profileImage, req)
      } : null,
      doctorId: doctor?._id || null,
      isApproved: doctor?.isApproved || false,
      approvalStatus: doctor?.approvalStatus || null,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in checkDoctorProfile:', error);
    next(error);
  }
};

// ============== SEARCH DOCTORS ==============
exports.searchDoctors = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { specialization, city, name, minRating, maxFee, page = 1, limit = 10 } = req.query;
    const query = { approvalStatus: 'approved', isApproved: true };

    if (specialization && specialization !== 'All') query.specialization = { $regex: specialization, $options: 'i' };
    if (city) query['clinicAddress.city'] = { $regex: city, $options: 'i' };
    if (minRating) query.rating = { $gte: parseFloat(minRating) };
    if (maxFee) query.consultationFee = { $lte: parseFloat(maxFee) };

    if (name && name.trim()) {
      const users = await User.find({ fullName: { $regex: name, $options: 'i' }, role: 'doctor' }).select('_id');
      const userIds = users.map(u => u._id);
      
      if (userIds.length > 0) {
        query.userId = { $in: userIds };
      } else {
        query.$or = [
          { specialization: { $regex: name, $options: 'i' } },
          { clinicName: { $regex: name, $options: 'i' } }
        ];
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const doctors = await Doctor.find(query)
      .populate('userId', 'fullName profileImage email phoneNumber')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ rating: -1, fullName: 1 })
      .lean();

    const formattedDoctors = doctors.map(doctor => ({
      ...doctor,
      profileImage: formatImageUrl(doctor.profileImage, req),
      name: doctor.userId?.fullName || doctor.fullName,
      fullName: doctor.userId?.fullName || doctor.fullName,
      email: doctor.userId?.email || doctor.email,
      phoneNumber: doctor.userId?.phoneNumber || doctor.phoneNumber
    }));

    const total = await Doctor.countDocuments(query);

    res.status(200).json({
      success: true,
      data: formattedDoctors,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('Search doctors error:', error);
    next(error);
  }
};

// ============== GET DOCTOR BY ID ==============
exports.getDoctorById = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctorId = req.params.id || req.params.doctorId;
    
    let doctor = await Doctor.findById(doctorId).populate('userId', 'fullName email phoneNumber profileImage').lean();
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId }).populate('userId', 'fullName email phoneNumber profileImage').lean();
    }
    
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const reviews = await Booking.find({
      doctorId: doctor._id,
      status: 'completed',
      rating: { $exists: true, $ne: null }
    }).select('rating review patientName createdAt');
    
    const stats = calculateRatingDistribution(reviews);

    const formattedDoctor = {
      ...doctor,
      profileImage: formatImageUrl(doctor.profileImage, req),
      name: doctor.userId?.fullName || doctor.fullName,
      fullName: doctor.userId?.fullName || doctor.fullName,
      email: doctor.userId?.email || doctor.email,
      phoneNumber: doctor.userId?.phoneNumber || doctor.phoneNumber,
      rating: stats.average,
      totalReviews: stats.total,
      ratingDistribution: stats.distribution,
      recentReviews: reviews.slice(0, 5)
    };

    res.status(200).json({ 
      success: true, 
      data: formattedDoctor,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('Error in getDoctorById:', error);
    next(error);
  }
};

// ============== GET SPECIALIZATIONS ==============
exports.getSpecializations = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const specializations = await Doctor.distinct('specialization', { isApproved: true, approvalStatus: 'approved' });
    const filteredSpecializations = specializations.filter(s => s && s !== 'All');
    res.status(200).json({ 
      success: true, 
      data: ['All', ...filteredSpecializations],
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('Error in getSpecializations:', error);
    next(error);
  }
};

// ============== GET TOP RATED DOCTORS ==============
exports.getTopRatedDoctors = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { limit = 5 } = req.query;
    const doctors = await Doctor.find({ approvalStatus: 'approved', isApproved: true })
      .populate('userId', 'fullName profileImage')
      .limit(parseInt(limit))
      .lean();

    const doctorsWithRatings = await Promise.all(doctors.map(async (doctor) => {
      const reviews = await Booking.find({
        doctorId: doctor._id,
        status: 'completed',
        rating: { $exists: true, $ne: null }
      }).select('rating');
      const stats = calculateRatingDistribution(reviews);
      
      return {
        ...doctor,
        profileImage: formatImageUrl(doctor.profileImage, req),
        name: doctor.userId?.fullName || doctor.fullName,
        fullName: doctor.userId?.fullName || doctor.fullName,
        rating: stats.average,
        totalReviews: stats.total
      };
    }));
    
    doctorsWithRatings.sort((a, b) => b.rating - a.rating);
    res.status(200).json({ 
      success: true, 
      data: doctorsWithRatings.slice(0, parseInt(limit)),
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('Error in getTopRatedDoctors:', error);
    next(error);
  }
};

// ==================== REGISTER DOCTOR ====================
exports.registerDoctor = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existingDoctor = await Doctor.findOne({ userId: req.user.userId });
    if (existingDoctor) {
      return res.status(400).json({ success: false, message: 'Doctor profile already exists' });
    }

    const doctorData = {
      userId: req.user.userId,
      fullName: req.body.fullName || req.body.name,
      specialization: req.body.specialization,
      qualification: req.body.qualification,
      experience: req.body.experience ? parseInt(req.body.experience) : 0,
      consultationFee: req.body.consultationFee ? parseInt(req.body.consultationFee) : 500,
      clinicAddress: req.body.clinicAddress ? 
        (typeof req.body.clinicAddress === 'string' ? JSON.parse(req.body.clinicAddress) : req.body.clinicAddress) : {},
      clinicName: req.body.clinicName,
      about: req.body.about,
      languages: req.body.languages ? 
        (typeof req.body.languages === 'string' ? JSON.parse(req.body.languages) : req.body.languages) : [],
      gender: req.body.gender,
      isApproved: false,
      approvalStatus: 'pending',
      subscriptionPlan: 'free',
      subscription: false,
      profileImage: null
    };

    if (req.files && req.files.profileImage && req.files.profileImage[0]) {
      const file = req.files.profileImage[0];
      doctorData.profileImage = `/uploads/profiles/${file.filename}`;
    }
    
    if (req.files && req.files.documents) {
      doctorData.documents = req.files.documents.map(file => ({
        url: `/uploads/documents/${file.filename}`,
        name: file.originalname,
        type: file.mimetype
      }));
    }

    const doctor = await Doctor.create(doctorData);
    await User.findByIdAndUpdate(req.user.userId, { role: 'doctor', isApproved: false });

    res.status(201).json({
      success: true,
      message: 'Doctor registration submitted for approval',
      doctor: {
        id: doctor._id,
        name: doctor.fullName,
        specialization: doctor.specialization,
        isApproved: doctor.isApproved,
        approvalStatus: doctor.approvalStatus,
        profileImage: formatImageUrl(doctor.profileImage, req)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in registerDoctor:', error);
    next(error);
  }
};

// Get doctor profile
exports.getDoctorProfile = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctorId = req.params.doctorId || req.user.userId;
    
    let doctor = await Doctor.findOne({ userId: doctorId }).populate('userId', 'fullName email phoneNumber profileImage role isApproved');
    if (!doctor && mongoose.Types.ObjectId.isValid(doctorId)) {
      doctor = await Doctor.findById(doctorId).populate('userId', 'fullName email phoneNumber profileImage role isApproved');
    }

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const doctorData = doctor.toObject();
    doctorData.profileImage = formatImageUrl(doctorData.profileImage, req);

    res.status(200).json({ 
      success: true, 
      data: doctorData,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDoctorProfile:', error);
    next(error);
  }
};

// ============== FIXED: Update doctor profile ==============
exports.updateDoctorProfile = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const updateData = { ...req.body, updatedAt: new Date() };
    
    // ✅ FIX: Save full URL when updating profile
    if (req.file) {
      const relativePath = `/uploads/profiles/${req.file.filename}`;
      
      if (process.env.NODE_ENV === 'production') {
        const baseUrl = process.env.BASE_URL || 'https://backend-1-mx86.onrender.com';
        updateData.profileImage = `${baseUrl}${relativePath}`;
      } else {
        const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
        updateData.profileImage = `${baseUrl}${relativePath}`;
      }
    }
    
    const doctor = await Doctor.findOneAndUpdate(
      { userId: req.user.userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const doctorResponse = doctor.toObject();
    // ✅ Use the saved URL directly (it's already a full URL)
    doctorResponse.profileImage = doctorResponse.profileImage;

    res.status(200).json({ 
      success: true, 
      message: 'Profile updated successfully', 
      data: doctorResponse,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in updateDoctorProfile:', error);
    next(error);
  }
};

// ============== FIXED: IMAGE UPLOAD METHODS ==============

exports.uploadProfileImage = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    // Delete old image if exists
    if (doctor.profileImage && 
        !doctor.profileImage.includes('placeholder') &&
        doctor.profileImage !== 'No image' &&
        doctor.profileImage !== 'null') {
      try {
        const oldImagePath = path.join(__dirname, '../..', doctor.profileImage.replace(/^https?:\/\/[^\/]+\//, ''));
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      } catch (e) {
        // If it's a URL, just ignore
      }
    }

    // ✅ FIX: Save the FULL URL, not just the relative path
    const relativePath = `/uploads/profiles/${req.file.filename}`;
    
    let fullImageUrl;
    if (process.env.NODE_ENV === 'production') {
      const baseUrl = process.env.BASE_URL || 'https://backend-1-mx86.onrender.com';
      fullImageUrl = `${baseUrl}${relativePath}`;
    } else {
      const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
      fullImageUrl = `${baseUrl}${relativePath}`;
    }

    // ✅ Save the FULL URL to database
    doctor.profileImage = fullImageUrl;
    doctor.updatedAt = new Date();
    await doctor.save();

    res.status(200).json({
      success: true,
      data: { 
        profileImage: fullImageUrl,  // ✅ Return full URL
        imagePath: relativePath, 
        filename: req.file.filename 
      },
      message: 'Profile image uploaded successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error uploading profile image:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(error);
  }
};

exports.uploadDocuments = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      req.files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const uploadedDocuments = req.files.map(file => ({
      url: `/uploads/documents/${file.filename}`,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    }));

    doctor.documents = [...(doctor.documents || []), ...uploadedDocuments];
    await doctor.save();

    const formattedDocuments = uploadedDocuments.map(doc => ({ ...doc, url: formatImageUrl(doc.url, req) }));

    res.status(200).json({
      success: true,
      data: formattedDocuments,
      message: `${uploadedDocuments.length} document(s) uploaded successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error uploading documents:', error);
    if (req.files) {
      req.files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
    }
    next(error);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { documentUrl } = req.params;
    const decodedUrl = decodeURIComponent(documentUrl);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const documentIndex = doctor.documents.findIndex(doc => doc.url === decodedUrl);
    if (documentIndex === -1) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const filePath = path.join(__dirname, '../..', decodedUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    doctor.documents.splice(documentIndex, 1);
    await doctor.save();

    res.status(200).json({ 
      success: true, 
      message: 'Document deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error deleting document:', error);
    next(error);
  }
};

// ============== FIXED: getMyDashboardStats ==============
exports.getMyDashboardStats = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    const totalAppointments = await Booking.countDocuments({ doctorId: doctor._id });
    const todayAppointments = await Booking.countDocuments({ doctorId: doctor._id, date: today });
    const completedAppointments = await Booking.countDocuments({ doctorId: doctor._id, status: 'completed' });
    const pendingAppointments = await Booking.countDocuments({ doctorId: doctor._id, status: { $in: ['confirmed', 'pending', 'waiting'] } });

    const todayCompleted = await Booking.find({ doctorId: doctor._id, date: today, status: 'completed' });
    const todayEarnings = todayCompleted.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    const allCompleted = await Booking.find({ doctorId: doctor._id, status: 'completed' });
    const totalEarnings = allCompleted.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    res.status(200).json({
      success: true,
      data: { totalAppointments, todayAppointments, completedAppointments, pendingAppointments, todayEarnings, totalEarnings },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getMyDashboardStats:', error);
    next(error);
  }
};

// ============== FIXED: getMyAppointments ==============
exports.getMyAppointments = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { date, status } = req.query;
    
    console.log(`👨‍⚕️ getMyAppointments - User ID: ${req.user.userId}`);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      console.log(`❌ Doctor not found for user: ${req.user.userId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Doctor profile not found' 
      });
    }
    
    const doctorId = doctor._id;
    console.log(`👨‍⚕️ Doctor ID: ${doctorId}`);
    
    let query = { 
      doctorId: doctorId
    };
    
    if (date) {
      let formattedDate;
      if (typeof date === 'string' && date.includes(' ')) {
        formattedDate = date.split(' ')[0];
      } else if (date instanceof Date) {
        formattedDate = date.toISOString().split('T')[0];
      } else {
        formattedDate = date;
      }
      query.date = formattedDate;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    } else {
      query.status = { $ne: 'cancelled' };
    }

    console.log(`🔍 Query:`, JSON.stringify(query, null, 2));

    const appointments = await Booking.find(query)
      .populate('patientId', 'fullName phoneNumber email profileImage name')
      .populate('userId', 'fullName phoneNumber email profileImage name')
      .sort({ date: -1, slotNumber: 1 });

    console.log(`✅ Found ${appointments.length} appointments for doctor ${doctorId}`);

    const formattedAppointments = appointments.map(appointment => {
      const patient = appointment.patientId || appointment.userId;
      const patientName = appointment.patientName || patient?.fullName || patient?.name || 'Patient';
      const patientPhone = appointment.patientPhone || patient?.phoneNumber || patient?.phone || '';
      
      return {
        _id: appointment._id,
        id: appointment._id,
        bookingId: appointment.bookingId || appointment._id,
        patientId: patient?._id || appointment.patientId || appointment.userId,
        patientName: patientName,
        patientPhone: patientPhone,
        patientEmail: patient?.email || '',
        doctorId: appointment.doctorId,
        doctorName: appointment.doctorName || doctor.fullName,
        date: appointment.date,
        time: appointment.timeSlot || appointment.time,
        timeSlot: appointment.timeSlot,
        slotNumber: appointment.slotNumber,
        status: appointment.status,
        bookingType: appointment.bookingType || 'online',
        isWalkIn: appointment.bookingType === 'walk-in' || appointment.appointmentType === 'offline',
        amount: appointment.amount || 0,
        paymentStatus: appointment.paymentStatus || 'pending',
        paymentMethod: appointment.paymentMethod || 'online',
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
        expectedTime: appointment.expectedTime || '',
        peopleAhead: appointment.peopleAhead || 0,
        type: appointment.appointmentType || appointment.bookingType || 'online'
      };
    });

    res.status(200).json({
      success: true,
      data: formattedAppointments,
      count: formattedAppointments.length,
      doctorId: doctorId,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });

  } catch (error) {
    console.error('❌ Error in getMyAppointments:', error);
    next(error);
  }
};

// ============== FIXED: getMySubscription ==============
exports.getMySubscription = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    const subscription = await Subscription.findOne({ doctorId: doctor._id });

    res.status(200).json({
      success: true,
      subscription: subscription || { 
        plan: doctor.subscriptionPlan || 'free', 
        status: doctor.subscription ? 'active' : 'inactive',
        expiryDate: doctor.subscriptionExpiry || null
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getMySubscription:', error);
    next(error);
  }
};

// ============== FIXED: getMyTimings ==============
exports.getMyTimings = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    res.status(200).json({
      success: true,
      data: {
        timeSlots: doctor.timeSlots || [],
        availableDays: doctor.availableDays || [],
        slotDuration: doctor.slotDuration || 30,
        homeService: doctor.homeService || false,
        weeklySchedule: doctor.weeklySchedule || {}
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getMyTimings:', error);
    next(error);
  }
};

// ============== OTHER METHODS ==============

exports.saveMyTimings = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    if (req.body.timeSlots) doctor.timeSlots = req.body.timeSlots;
    if (req.body.availableDays) doctor.availableDays = req.body.availableDays;
    if (req.body.slotDuration !== undefined) doctor.slotDuration = req.body.slotDuration;
    if (req.body.homeService !== undefined) doctor.homeService = req.body.homeService;
    if (req.body.weeklySchedule) doctor.weeklySchedule = req.body.weeklySchedule;
    
    await doctor.save();
    
    res.status(200).json({
      success: true,
      message: 'Schedule saved successfully',
      data: {
        timeSlots: doctor.timeSlots,
        availableDays: doctor.availableDays,
        slotDuration: doctor.slotDuration,
        homeService: doctor.homeService,
        weeklySchedule: doctor.weeklySchedule
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in saveMyTimings:', error);
    next(error);
  }
};

exports.updateMyTimings = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    if (req.body.timeSlots) doctor.timeSlots = req.body.timeSlots;
    if (req.body.availableDays) doctor.availableDays = req.body.availableDays;
    if (req.body.slotDuration !== undefined) doctor.slotDuration = req.body.slotDuration;
    if (req.body.homeService !== undefined) doctor.homeService = req.body.homeService;
    if (req.body.weeklySchedule) doctor.weeklySchedule = req.body.weeklySchedule;
    
    await doctor.save();
    
    res.status(200).json({
      success: true,
      message: 'Schedule updated successfully',
      data: {
        timeSlots: doctor.timeSlots,
        availableDays: doctor.availableDays,
        slotDuration: doctor.slotDuration,
        homeService: doctor.homeService,
        weeklySchedule: doctor.weeklySchedule
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in updateMyTimings:', error);
    next(error);
  }
};

exports.getMyEarnings = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const { period = 'all' } = req.query;
    let query = { doctorId: doctor._id, status: 'completed' };
    
    if (period === 'today') {
      const today = new Date().toISOString().split('T')[0];
      query.date = today;
    } else if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query.createdAt = { $gte: weekAgo };
    } else if (period === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      query.createdAt = { $gte: monthAgo };
    }

    const completedAppointments = await Booking.find(query);
    const totalEarnings = completedAppointments.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    res.status(200).json({
      success: true,
      data: { total: totalEarnings, count: completedAppointments.length, period },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in getMyEarnings:', error);
    next(error);
  }
};

// Get doctor profile by ID (for public viewing)
exports.getDoctorProfileById = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    
    let doctor = await Doctor.findById(doctorId).populate('userId', 'fullName email phoneNumber profileImage role isApproved');
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId }).populate('userId', 'fullName email phoneNumber profileImage role isApproved');
    }

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const doctorData = doctor.toObject();
    doctorData.profileImage = formatImageUrl(doctorData.profileImage, req);

    res.status(200).json({ 
      success: true, 
      data: doctorData,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDoctorProfileById:', error);
    next(error);
  }
};

// ============== DOCTOR TIMING MANAGEMENT ==============

exports.setTimings = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const { timeSlots } = req.body;
    doctor.timeSlots = timeSlots;
    doctor.availableDays = timeSlots.map(slot => slot.day);
    await doctor.save();

    res.status(200).json({
      success: true,
      message: 'Timings set successfully',
      data: { timeSlots: doctor.timeSlots, availableDays: doctor.availableDays },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in setTimings:', error);
    next(error);
  }
};

exports.getTimings = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    res.status(200).json({
      success: true,
      data: { timeSlots: doctor?.timeSlots || [], availableDays: doctor?.availableDays || [] },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getTimings:', error);
    next(error);
  }
};

exports.updateSlot = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { slotId } = req.params;
    const updates = req.body;

    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    let slotUpdated = false;
    doctor.timeSlots = doctor.timeSlots.map(daySlot => {
      if (daySlot.slots) {
        daySlot.slots = daySlot.slots.map(slot => {
          if (slot._id.toString() === slotId) {
            slotUpdated = true;
            return { ...slot.toObject(), ...updates };
          }
          return slot;
        });
      }
      return daySlot;
    });

    if (!slotUpdated) {
      return res.status(404).json({ success: false, message: 'Slot not found' });
    }

    await doctor.save();
    res.status(200).json({ 
      success: true, 
      message: 'Slot updated successfully', 
      data: doctor.timeSlots,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in updateSlot:', error);
    next(error);
  }
};

exports.deleteSlot = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { slotId } = req.params;
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    doctor.timeSlots = doctor.timeSlots.map(daySlot => {
      if (daySlot.slots) {
        daySlot.slots = daySlot.slots.filter(slot => slot._id.toString() !== slotId);
      }
      return daySlot;
    });

    await doctor.save();
    res.status(200).json({ 
      success: true, 
      message: 'Slot deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in deleteSlot:', error);
    next(error);
  }
};

// ============== DOCTOR TIMING BY ID ==============

exports.getDoctorTimingById = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    
    let doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId });
    }
    
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    if (!checkDoctorAccess(doctor, req) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to view this doctor\'s schedule' });
    }

    res.status(200).json({
      success: true,
      data: {
        timeSlots: doctor.timeSlots || [],
        availableDays: doctor.availableDays || [],
        slotDuration: doctor.slotDuration || 30,
        homeService: doctor.homeService || false
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDoctorTimingById:', error);
    next(error);
  }
};

// ============== DOCTOR AVAILABILITY ==============

exports.getDoctorAvailability = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    const { date } = req.query;
    
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const schedule = await Schedule.findOne({ doctorId });
    
    if (!schedule) {
      return res.status(200).json({
        success: true,
        data: { isAvailable: false, message: 'Schedule not configured' },
        timestamp: new Date().toISOString()
      });
    }
    
    const dayOfWeek = moment(date).format('dddd');
    const isWorkingDay = schedule.workingDays?.includes(dayOfWeek) || false;
    
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + (schedule.maxAdvanceBooking || 30));
    const isWithinAdvance = new Date(date) <= maxDate;
    
    const isPast = moment(date).isBefore(moment(), 'day');
    
    res.status(200).json({
      success: true,
      data: {
        isWorkingDay,
        isWithinAdvanceBooking: isWithinAdvance,
        isPastDate: isPast,
        isAvailable: isWorkingDay && !isPast && isWithinAdvance,
        openTime: schedule.startTime,
        closeTime: schedule.endTime,
        slotDuration: schedule.slotDuration
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('Error in getDoctorAvailability:', error);
    next(error);
  }
};

// ============== DOCTOR SLOTS ==============

exports.getDoctorSlots = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }
    
    const schedule = await Schedule.findOne({ doctorId });
    if (!schedule) {
      return res.status(200).json({ success: true, data: { slots: [] }, timestamp: new Date().toISOString() });
    }
    
    const selectedDate = moment(date).format('YYYY-MM-DD');
    const dayOfWeek = moment(selectedDate).format('dddd');
    
    if (!schedule.workingDays?.includes(dayOfWeek)) {
      return res.status(200).json({ 
        success: true, 
        data: { slots: [], isWorkingDay: false },
        timestamp: new Date().toISOString()
      });
    }
    
    if (moment(selectedDate).isBefore(moment(), 'day')) {
      return res.status(200).json({ 
        success: true, 
        data: { slots: [], isPastDate: true },
        timestamp: new Date().toISOString()
      });
    }
    
    let slots = await Slot.find({
      doctorId,
      date: new Date(selectedDate)
    }).sort('slotNumber');
    
    if (slots.length === 0) {
      const generatedSlots = generateTimeSlots(
        selectedDate,
        schedule.startTime,
        schedule.endTime,
        schedule.slotDuration || 30,
        schedule.lunchBreak
      );
      
      const slotDocuments = generatedSlots.map(slot => ({
        doctorId,
        date: new Date(slot.date),
        slotNumber: slot.slotNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        duration: schedule.slotDuration || 30,
        isAvailable: true,
        isBooked: false,
        status: 'available'
      }));
      
      if (slotDocuments.length > 0) {
        slots = await Slot.insertMany(slotDocuments);
      }
    }
    
    const bookedAppointments = await Booking.find({
      doctorId,
      bookingDate: {
        $gte: moment(selectedDate).startOf('day').toDate(),
        $lt: moment(selectedDate).endOf('day').toDate()
      },
      status: { $in: ['confirmed', 'pending'] }
    }).select('slotNumber');
    
    const bookedSlotNumbers = new Set(bookedAppointments.map(b => b.slotNumber));
    
    const slotsWithAvailability = slots.map(slot => ({
      slotNumber: slot.slotNumber,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isBooked: bookedSlotNumbers.has(slot.slotNumber),
      isAvailable: !bookedSlotNumbers.has(slot.slotNumber),
      status: slot.status
    }));
    
    res.status(200).json({
      success: true,
      data: {
        slots: slotsWithAvailability,
        openTime: schedule.startTime,
        closeTime: schedule.endTime,
        slotDuration: schedule.slotDuration || 30,
        totalSlots: slotsWithAvailability.length,
        availableSlots: slotsWithAvailability.filter(s => !s.isBooked).length,
        bookedSlots: slotsWithAvailability.filter(s => s.isBooked).length
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('Error in getDoctorSlots:', error);
    next(error);
  }
};

// ============== DOCTOR APPOINTMENTS BY ID ==============

exports.getDoctorAppointmentsById = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    const { date, status } = req.query;

    let doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId });
    }
    
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    if (!checkDoctorAccess(doctor, req) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to view these appointments' });
    }

    let query = { doctorId: doctor._id };
    
    if (date) {
      const formattedDate = new Date(date).toISOString().split('T')[0];
      query.date = formattedDate;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const appointments = await Booking.find(query)
      .populate('userId', 'fullName phoneNumber email profileImage')
      .sort({ date: -1, time: 1 });

    res.status(200).json({
      success: true,
      data: appointments,
      count: appointments.length,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDoctorAppointmentsById:', error);
    next(error);
  }
};

// ============== APPOINTMENTS ==============

exports.getAppointments = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const { date, status } = req.query;
    let query = { doctorId: doctor._id };
    
    if (date) {
      const formattedDate = new Date(date).toISOString().split('T')[0];
      query.date = formattedDate;
    }
    
    if (status && status !== 'all') query.status = status;

    const appointments = await Booking.find(query)
      .populate('userId', 'fullName phoneNumber email profileImage name')
      .sort({ date: -1, time: 1 });

    const formattedAppointments = appointments.map(appointment => ({
      _id: appointment._id,
      id: appointment._id,
      bookingId: appointment.bookingId,
      patientId: appointment.userId?._id || appointment.userId,
      patientName: appointment.patientName || appointment.userId?.fullName || appointment.userId?.name,
      patientPhone: appointment.patientPhone || appointment.userId?.phoneNumber,
      patientEmail: appointment.userId?.email,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctorName,
      date: appointment.date,
      time: appointment.timeSlot || appointment.time,
      timeSlot: appointment.timeSlot,
      slotNumber: appointment.slotNumber,
      status: appointment.status,
      bookingType: appointment.bookingType,
      isWalkIn: appointment.bookingType === 'walk-in',
      amount: appointment.amount,
      paymentStatus: appointment.paymentStatus,
      paymentMethod: appointment.paymentMethod,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt
    }));

    res.status(200).json({ 
      success: true, 
      data: formattedAppointments, 
      count: formattedAppointments.length,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getAppointments:', error);
    next(error);
  }
};

exports.updateAppointmentStatus = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { appointmentId } = req.params;
    const { status } = req.body;

    const booking = await Booking.findByIdAndUpdate(
      appointmentId,
      { status },
      { new: true }
    ).populate('userId', 'fullName phoneNumber');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Appointment status updated', 
      data: booking,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in updateAppointmentStatus:', error);
    next(error);
  }
};

// ============== GET MY PROFILE ==============

exports.getMyProfile = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId })
      .populate('userId', 'fullName email phoneNumber profileImage role isApproved');
    
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    const doctorData = doctor.toObject();
    doctorData.profileImage = formatImageUrl(doctorData.profileImage, req);
    
    res.status(200).json({ 
      success: true, 
      data: doctorData,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('Error in getMyProfile:', error);
    next(error);
  }
};

// ============== UPDATE MY PROFILE ==============

// ============== GET MY APPOINTMENTS BY DATE ==============

exports.getMyAppointmentsByDate = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { date } = req.params;
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    const formattedDate = new Date(date).toISOString().split('T')[0];
    
    const appointments = await Booking.find({
      doctorId: doctor._id,
      date: formattedDate
    }).populate('userId', 'fullName phoneNumber email');
    
    const formattedAppointments = appointments.map(appointment => ({
      _id: appointment._id,
      id: appointment._id,
      bookingId: appointment.bookingId,
      patientId: appointment.userId?._id || appointment.userId,
      patientName: appointment.patientName || appointment.userId?.fullName,
      patientPhone: appointment.patientPhone || appointment.userId?.phoneNumber,
      patientEmail: appointment.userId?.email,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctorName,
      date: appointment.date,
      time: appointment.timeSlot || appointment.time,
      slotNumber: appointment.slotNumber,
      status: appointment.status,
      bookingType: appointment.bookingType,
      isWalkIn: appointment.bookingType === 'walk-in',
      amount: appointment.amount,
      paymentStatus: appointment.paymentStatus,
      createdAt: appointment.createdAt
    }));
    
    res.status(200).json({
      success: true,
      data: formattedAppointments,
      count: formattedAppointments.length,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('Error in getMyAppointmentsByDate:', error);
    next(error);
  }
};

// ============== GET EARNINGS SUMMARY ==============

exports.getEarningsSummary = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const completedAppointments = await Booking.find({ doctorId: doctor._id, status: 'completed' });
    const totalEarnings = completedAppointments.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    const completedWithdrawals = await PaymentRequest.find({ doctorId: doctor._id, status: 'completed' });
    const withdrawn = completedWithdrawals.reduce((sum, req) => sum + req.amount, 0);

    const pendingRequests = await PaymentRequest.find({ doctorId: doctor._id, status: { $in: ['pending', 'approved', 'processing'] } });
    const pendingAmount = pendingRequests.reduce((sum, req) => sum + req.amount, 0);
    const availableBalance = totalEarnings - withdrawn - pendingAmount;

    const recentTransactions = await PaymentRequest.find({ doctorId: doctor._id }).sort({ updatedAt: -1 }).limit(10);

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalEarnings, withdrawn, pendingWithdrawals: pendingAmount,
          availableBalance: Math.max(0, availableBalance),
          completedAppointments: completedAppointments.length
        },
        recentTransactions,
        bankDetails: doctor.bankDetails || null
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getEarningsSummary:', error);
    next(error);
  }
};

// ============== GET NEARBY DOCTORS ==============

exports.getNearbyDoctors = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { lat, lng, radius = 10 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }
    
    const doctors = await Doctor.find({
      isApproved: true,
      approvalStatus: 'approved'
    }).limit(20);
    
    const formattedDoctors = doctors.map(doctor => ({
      _id: doctor._id,
      name: doctor.fullName,
      specialization: doctor.specialization,
      consultationFee: doctor.consultationFee,
      profileImage: formatImageUrl(doctor.profileImage, req),
      clinicName: doctor.clinicName,
      clinicAddress: doctor.clinicAddress,
      rating: doctor.rating || 4.5,
      distance: Math.random() * radius
    }));
    
    res.status(200).json({ 
      success: true, 
      data: formattedDoctors,
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('Error in getNearbyDoctors:', error);
    next(error);
  }
};

// ============== DOCTOR STATS ==============

exports.getDoctorStats = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    
    let doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId });
    }
    
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    if (!checkDoctorAccess(doctor, req) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to view these stats' });
    }

    const today = new Date().toISOString().split('T')[0];
    
    const totalAppointments = await Booking.countDocuments({ doctorId: doctor._id });
    const todayAppointments = await Booking.countDocuments({ doctorId: doctor._id, date: today });
    const completedAppointments = await Booking.countDocuments({ doctorId: doctor._id, status: 'completed' });
    const pendingAppointments = await Booking.countDocuments({ doctorId: doctor._id, status: { $in: ['confirmed', 'pending', 'waiting'] } });

    const todayCompleted = await Booking.find({ doctorId: doctor._id, date: today, status: 'completed' });
    const todayEarnings = todayCompleted.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    const allCompleted = await Booking.find({ doctorId: doctor._id, status: 'completed' });
    const totalEarnings = allCompleted.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    const reviews = await Booking.find({
      doctorId: doctor._id,
      status: 'completed',
      rating: { $exists: true, $ne: null }
    }).select('rating');
    
    const ratingStats = calculateRatingDistribution(reviews);

    res.status(200).json({
      success: true,
      data: {
        totalAppointments, todayAppointments, completedAppointments, pendingAppointments,
        todayEarnings, totalEarnings,
        rating: ratingStats.average, totalReviews: ratingStats.total, ratingDistribution: ratingStats.distribution
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDoctorStats:', error);
    next(error);
  }
};

// ============== GET DASHBOARD STATS ==============

exports.getDashboardStats = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    const totalAppointments = await Booking.countDocuments({ doctorId: doctor._id });
    const todayAppointments = await Booking.countDocuments({ doctorId: doctor._id, date: today });
    const completedAppointments = await Booking.countDocuments({ doctorId: doctor._id, status: 'completed' });
    const pendingAppointments = await Booking.countDocuments({ doctorId: doctor._id, status: { $in: ['confirmed', 'pending', 'waiting'] } });

    const todayCompleted = await Booking.find({ doctorId: doctor._id, date: today, status: 'completed' });
    const todayEarnings = todayCompleted.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    const allCompleted = await Booking.find({ doctorId: doctor._id, status: 'completed' });
    const totalEarnings = allCompleted.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    const reviews = await Booking.find({
      doctorId: doctor._id,
      status: 'completed',
      rating: { $exists: true, $ne: null }
    }).select('rating');
    
    const ratingStats = calculateRatingDistribution(reviews);

    res.status(200).json({
      success: true,
      data: {
        totalAppointments, todayAppointments, completedAppointments, pendingAppointments,
        todayEarnings, totalEarnings,
        rating: ratingStats.average, totalReviews: ratingStats.total, ratingDistribution: ratingStats.distribution
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDashboardStats:', error);
    next(error);
  }
};

// ============== GET EARNINGS ==============

exports.getEarnings = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const { period = 'all' } = req.query;
    let query = { doctorId: doctor._id, status: 'completed' };
    
    if (period === 'today') {
      const today = new Date().toISOString().split('T')[0];
      query.date = today;
    } else if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query.createdAt = { $gte: weekAgo };
    } else if (period === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      query.createdAt = { $gte: monthAgo };
    }

    const completedAppointments = await Booking.find(query);
    const totalEarnings = completedAppointments.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    res.status(200).json({
      success: true,
      data: { total: totalEarnings, count: completedAppointments.length, period },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in getEarnings:', error);
    next(error);
  }
};

// ============== GET DOCTOR SUBSCRIPTION BY ID ==============

exports.getDoctorSubscriptionById = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { doctorId } = req.params;
    
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const subscription = await Subscription.findOne({ doctorId: doctor._id });

    res.status(200).json({
      success: true,
      subscription: subscription || { 
        plan: doctor.subscriptionPlan || 'free', 
        status: doctor.subscription ? 'active' : 'inactive',
        expiryDate: doctor.subscriptionExpiry || null
      },
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getDoctorSubscriptionById:', error);
    next(error);
  }
};

// ============== UPGRADE SUBSCRIPTION ==============

exports.upgradeSubscription = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const { plan, duration, paymentId, amount } = req.body;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + duration);

    const subscription = await Subscription.findOneAndUpdate(
      { doctorId: doctor._id },
      { plan, duration, endDate, paymentId, amount, paymentStatus: 'completed', status: 'active', startDate: new Date() },
      { upsert: true, new: true }
    );

    doctor.subscription = true;
    doctor.subscriptionPlan = plan;
    doctor.subscriptionExpiry = endDate;
    await doctor.save();

    res.status(200).json({ 
      success: true, 
      message: 'Subscription upgraded successfully', 
      data: { subscription },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in upgradeSubscription:', error);
    next(error);
  }
};

// ============== PAYMENT REQUESTS ==============

exports.requestPayment = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { amount, paymentMethod, accountDetails } = req.body;
    
    if (!amount) {
      return res.status(400).json({ success: false, message: 'Amount is required' });
    }

    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    if (!doctor.isApproved) {
      return res.status(403).json({ success: false, message: 'Account must be approved first' });
    }

    if (amount < 100) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is ₹100' });
    }

    const completedAppointments = await Booking.find({ doctorId: doctor._id, status: 'completed' });
    const totalEarnings = completedAppointments.reduce((sum, apt) => sum + (apt.amount || 0), 0);

    const pendingRequests = await PaymentRequest.find({ doctorId: doctor._id, status: { $in: ['pending', 'approved', 'processing'] } });
    const pendingAmount = pendingRequests.reduce((sum, req) => sum + req.amount, 0);
    const availableBalance = totalEarnings - pendingAmount;

    if (amount > availableBalance) {
      return res.status(400).json({ success: false, message: `Insufficient balance. Available: ₹${availableBalance}` });
    }

    let bankDetailsToUse = accountDetails;
    if (!bankDetailsToUse || Object.keys(bankDetailsToUse).length === 0) {
      if (doctor.bankDetails && doctor.bankDetails.accountNumber) {
        bankDetailsToUse = doctor.bankDetails;
      } else {
        return res.status(400).json({ success: false, message: 'Bank details are required' });
      }
    }

    const paymentRequest = new PaymentRequest({
      doctorId: doctor._id,
      amount,
      paymentMethod: paymentMethod || 'bank_transfer',
      accountDetails: bankDetailsToUse,
      status: 'pending',
      requestedAt: new Date()
    });

    await paymentRequest.save();

    res.status(201).json({
      success: true,
      message: 'Payment request submitted successfully',
      data: { requestId: paymentRequest._id, amount: paymentRequest.amount, status: paymentRequest.status },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in requestPayment:', error);
    next(error);
  }
};

exports.getPaymentRequests = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const { status, page = 1, limit = 10 } = req.query;
    const query = { doctorId: doctor._id };
    if (status) query.status = status;

    const paymentRequests = await PaymentRequest.find(query)
      .sort({ requestedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await PaymentRequest.countDocuments(query);

    res.status(200).json({
      success: true,
      data: paymentRequests,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), limit: parseInt(limit) },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in getPaymentRequests:', error);
    next(error);
  }
};

exports.getPaymentRequestDetails = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { requestId } = req.params;
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    const paymentRequest = await PaymentRequest.findOne({ _id: requestId, doctorId: doctor._id });

    if (!paymentRequest) {
      return res.status(404).json({ success: false, message: 'Payment request not found' });
    }

    res.status(200).json({ 
      success: true, 
      data: paymentRequest,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in getPaymentRequestDetails:', error);
    next(error);
  }
};

exports.cancelPaymentRequest = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { requestId } = req.params;
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    
    const paymentRequest = await PaymentRequest.findOne({ _id: requestId, doctorId: doctor._id, status: { $in: ['pending', 'approved'] } });

    if (!paymentRequest) {
      return res.status(404).json({ success: false, message: 'Payment request not found or cannot be cancelled' });
    }

    paymentRequest.status = 'cancelled';
    paymentRequest.adminNotes = 'Cancelled by doctor';
    await paymentRequest.save();

    res.status(200).json({ 
      success: true, 
      message: 'Payment request cancelled successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in cancelPaymentRequest:', error);
    next(error);
  }
};

// ============== BANK DETAILS ==============

exports.updateBankDetails = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const { accountHolderName, accountNumber, confirmAccountNumber, ifscCode, bankName, branch, upiId, accountType } = req.body;

    if (!accountHolderName || !accountNumber || !ifscCode || !bankName) {
      return res.status(400).json({ success: false, message: 'All bank details are required' });
    }

    if (confirmAccountNumber && accountNumber !== confirmAccountNumber) {
      return res.status(400).json({ success: false, message: 'Account numbers do not match' });
    }

    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifscCode)) {
      return res.status(400).json({ success: false, message: 'Invalid IFSC code format' });
    }

    const doctor = await Doctor.findOneAndUpdate(
      { userId: req.user.userId },
      {
        bankDetails: {
          accountHolderName,
          accountNumber,
          ifscCode: ifscCode.toUpperCase(),
          bankName,
          branch: branch || '',
          upiId: upiId || '',
          accountType: accountType || 'savings',
          verified: false,
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Bank details updated successfully',
      data: {
        accountHolderName: doctor.bankDetails.accountHolderName,
        bankName: doctor.bankDetails.bankName,
        accountNumber: 'XXXX' + doctor.bankDetails.accountNumber.slice(-4),
        ifscCode: doctor.bankDetails.ifscCode,
        verified: doctor.bankDetails.verified
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in updateBankDetails:', error);
    next(error);
  }
};

exports.getBankDetails = async (req, res, next) => {
  try {
    setNoCacheHeaders(res);
    
    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const bankDetails = doctor.bankDetails ? {
      accountHolderName: doctor.bankDetails.accountHolderName,
      bankName: doctor.bankDetails.bankName,
      accountNumber: doctor.bankDetails.accountNumber ? 'XXXX' + doctor.bankDetails.accountNumber.slice(-4) : null,
      ifscCode: doctor.bankDetails.ifscCode,
      branch: doctor.bankDetails.branch,
      upiId: doctor.bankDetails.upiId,
      accountType: doctor.bankDetails.accountType,
      verified: doctor.bankDetails.verified || false
    } : null;

    res.status(200).json({ 
      success: true, 
      data: bankDetails || {},
      timestamp: new Date().toISOString(),
      _cacheBust: Date.now()
    });
  } catch (error) {
    console.error('❌ Error in getBankDetails:', error);
    next(error);
  }
};