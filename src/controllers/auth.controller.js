const User = require('../models/User');
const Doctor = require('../models/Doctor');
const OTP = require('../models/OTP');
const jwtService = require('../services/jwt.service');
const otpService = require('../services/otp.service');
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');

// Send OTP for login/registration
exports.sendOTP = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const { phoneNumber } = req.body;

    // Validate phone number
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Clean phone number
    const cleanNumber = phoneNumber.replace(/[\s\-()]/g, '');
    
    // Generate OTP
    const otp = otpService.generateOTP();
    
    // Delete any existing OTPs for this phone number
    await OTP.deleteMany({ phoneNumber: cleanNumber });
    
    // Save new OTP to database
    const otpRecord = await OTP.create({
      phoneNumber: cleanNumber,
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
      verified: false
    });

    // Send OTP via MSG91
    await otpService.sendOTP(cleanNumber, otp);

    // Log without OTP (production safe)
    console.log(`✅ OTP sent to ${cleanNumber} at ${new Date().toISOString()}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      // Include these for development/debugging only
      ...(process.env.NODE_ENV === 'development' && { 
        debug: { otp, expiresAt: otpRecord.expiresAt } 
      })
    });
  } catch (error) {
    console.error('❌ Send OTP Error:', error.message);
    
    // Handle specific error types
    if (error.message.includes('Rate limit')) {
      return res.status(429).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('Invalid Indian phone number')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes('MSG91 Error')) {
      return res.status(503).json({
        success: false,
        message: 'SMS service temporarily unavailable. Please try again later.'
      });
    }

    next(error);
  }
};

// Verify OTP and login/register
exports.verifyOTP = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const { phoneNumber, otp, name, fullName, email, role } = req.body;

    // Clean phone number
    const cleanNumber = phoneNumber.replace(/[\s\-()]/g, '');

    console.log(`📱 Verifying OTP for: ${cleanNumber}`);

    // Find OTP record
    const otpRecord = await OTP.findOne({
      phoneNumber: cleanNumber,
      otp,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      // Increment attempts for any existing record
      const existingRecord = await OTP.findOne({ phoneNumber: cleanNumber });
      if (existingRecord) {
        existingRecord.attempts += 1;
        await existingRecord.save();
        
        // Check if max attempts exceeded
        if (existingRecord.attempts >= 5) {
          await OTP.deleteOne({ _id: existingRecord._id });
          return res.status(400).json({
            success: false,
            message: 'Maximum OTP attempts exceeded. Please request a new OTP.'
          });
        }
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Check attempts
    if (otpRecord.attempts >= 5) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: 'Maximum OTP attempts exceeded. Please request a new OTP.'
      });
    }

    // Find or create user
    let user = await User.findOne({ phoneNumber: cleanNumber });

    if (!user) {
      const userName = fullName || name || 'User';
      
      user = await User.create({
        fullName: userName,
        name: userName,
        displayName: userName,
        username: userName,
        phoneNumber: cleanNumber,
        email: email || `user_${cleanNumber}@temp.com`,
        role: role || 'patient',
        isVerified: true,
        isApproved: role === 'doctor' ? false : true
      });
      
      console.log(`✅ User created: ${user._id}`);
      
      // Create doctor document if role is doctor
      if (user.role === 'doctor') {
        try {
          await Doctor.create({
            userId: user._id,
            fullName: userName,
            name: userName,
            email: email || `user_${cleanNumber}@temp.com`,
            phoneNumber: cleanNumber,
            isApproved: false,
            approvalStatus: 'pending',
            specialization: req.body.specialization || 'General Physician',
            consultationFee: parseInt(req.body.consultationFee) || 500,
            clinicName: req.body.clinicName || ''
          });
          console.log(`✅ Doctor document created for user: ${user._id}`);
        } catch (docError) {
          console.error('❌ Error creating doctor document:', docError);
          // Don't fail the request, just log the error
        }
      }
    } else {
      user.lastLogin = new Date();
      await user.save();
      console.log(`✅ Existing user found: ${user._id}`);
    }

    // Delete used OTP
    await OTP.deleteOne({ _id: otpRecord._id });

    // Get doctor document if user is doctor
    let doctorDoc = null;
    let doctorDocumentId = null;
    
    if (user.role === 'doctor') {
      doctorDoc = await Doctor.findOne({ userId: user._id });
      if (doctorDoc) {
        doctorDocumentId = doctorDoc._id;
        console.log(`🆔 Doctor document ID: ${doctorDocumentId}`);
      }
    }

    // Generate JWT token
    const token = jwtService.generateToken({
      userId: user._id,
      phoneNumber: user.phoneNumber,
      role: user.role,
      doctorId: doctorDocumentId
    });

    // Prepare user data
    const userData = {
      id: user._id,
      _id: user._id,
      phoneNumber: user.phoneNumber,
      fullName: user.fullName,
      name: user.name || user.fullName,
      displayName: user.displayName || user.fullName,
      username: user.username || user.fullName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      isApproved: user.isApproved || false,
      subscription: user.subscription || false,
      specialization: user.specialization || '',
      qualification: user.qualification || '',
      experience: user.experience || '',
      clinicName: user.clinicName || '',
      consultationFee: user.consultationFee || 500,
      doctorDocumentId: doctorDocumentId,
      doctorId: doctorDocumentId
    };

    if (doctorDoc) {
      userData.doctor = {
        _id: doctorDoc._id,
        name: doctorDoc.fullName || doctorDoc.name,
        fullName: doctorDoc.fullName || doctorDoc.name,
        specialization: doctorDoc.specialization || '',
        consultationFee: doctorDoc.consultationFee || 500,
        clinicName: doctorDoc.clinicName || '',
        isApproved: doctorDoc.isApproved || false,
        profileImage: doctorDoc.profileImage || '',
        qualification: doctorDoc.qualification || '',
        experience: doctorDoc.experience || ''
      };
      if (doctorDoc.fullName || doctorDoc.name) {
        userData.fullName = doctorDoc.fullName || doctorDoc.name;
        userData.name = doctorDoc.fullName || doctorDoc.name;
        userData.displayName = doctorDoc.fullName || doctorDoc.name;
        userData.username = doctorDoc.fullName || doctorDoc.name;
      }
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: userData,
      doctor: doctorDoc ? {
        id: doctorDoc._id,
        isApproved: doctorDoc.isApproved,
        approvalStatus: doctorDoc.approvalStatus || 'pending',
        consultationFee: doctorDoc.consultationFee
      } : null
    });
  } catch (error) {
    console.error('❌ Error in verifyOTP:', error);
    next(error);
  }
};

// ============ DOCTOR LOGIN ============
exports.doctorLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const { phoneNumber, password } = req.body;
    console.log(`🔐 Doctor login attempt for: ${phoneNumber}`);

    const user = await User.findOne({ phoneNumber, role: 'doctor' }).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    let doctorDoc = await Doctor.findOne({ userId: user._id });
    
    if (!doctorDoc) {
      doctorDoc = await Doctor.create({
        userId: user._id,
        fullName: user.fullName || user.name || '',
        name: user.fullName || user.name || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber,
        specialization: user.specialization || 'General Physician',
        consultationFee: user.consultationFee || 500,
        isApproved: user.isApproved || false,
        approvalStatus: user.isApproved ? 'approved' : 'pending'
      });
      console.log(`✅ Doctor document created: ${doctorDoc._id}`);
    }

    const token = jwtService.generateToken({
      userId: user._id,
      phoneNumber: user.phoneNumber,
      role: user.role,
      doctorId: doctorDoc._id
    });

    const userData = {
      id: user._id,
      _id: user._id,
      phoneNumber: user.phoneNumber,
      fullName: doctorDoc.fullName || user.fullName || user.name || '',
      name: doctorDoc.fullName || user.fullName || user.name || '',
      displayName: doctorDoc.fullName || user.fullName || user.name || '',
      username: doctorDoc.fullName || user.fullName || user.name || '',
      email: user.email || doctorDoc.email || '',
      role: user.role,
      isVerified: user.isVerified || true,
      isApproved: user.isApproved || false,
      subscription: user.subscription || false,
      specialization: doctorDoc.specialization || user.specialization || '',
      qualification: doctorDoc.qualification || user.qualification || '',
      experience: doctorDoc.experience || user.experience || '',
      clinicName: doctorDoc.clinicName || user.clinicName || '',
      consultationFee: doctorDoc.consultationFee || user.consultationFee || 500,
      doctorDocumentId: doctorDoc._id,
      doctorId: doctorDoc._id,
      doctor: {
        _id: doctorDoc._id,
        name: doctorDoc.fullName || doctorDoc.name,
        fullName: doctorDoc.fullName || doctorDoc.name,
        specialization: doctorDoc.specialization || '',
        consultationFee: doctorDoc.consultationFee || 500,
        clinicName: doctorDoc.clinicName || '',
        isApproved: doctorDoc.isApproved || false,
        profileImage: doctorDoc.profileImage || '',
        qualification: doctorDoc.qualification || '',
        experience: doctorDoc.experience || ''
      }
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: userData
    });

  } catch (error) {
    console.error('❌ Doctor login error:', error);
    next(error);
  }
};

// ============ ADMIN LOGIN ============
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log(`🔐 Admin login attempt for: ${email}`);
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    const admin = await User.findOne({ 
      email: email.toLowerCase().trim(), 
      role: 'admin' 
    }).select('+password');
    
    if (!admin) {
      console.log(`❌ Admin not found: ${email}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    console.log(`✅ Admin found: ${admin._id}`);
    
    const isMatch = await admin.comparePassword(password);
    
    if (!isMatch) {
      console.log(`❌ Invalid password for admin: ${email}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { 
        userId: admin._id,
        email: admin.email,
        role: admin.role
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );
    
    console.log(`✅ Admin login successful: ${email}`);
    
    res.status(200).json({
      success: true,
      token: token,
      admin: {
        id: admin._id,
        fullName: admin.fullName || 'Admin',
        email: admin.email,
        role: admin.role
      }
    });
    
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Register Doctor
exports.registerDoctor = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const {
      name,
      fullName,
      email,
      phoneNumber,
      specialization,
      qualification,
      experience,
      clinicName,
      registrationNumber,
      consultationFee,
      clinicAddress,
      password
    } = req.body;

    console.log(`👨‍⚕️ Registering doctor: ${fullName || name}`);

    // Clean phone number
    const cleanNumber = phoneNumber.replace(/[\s\-()]/g, '');

    const existingUser = await User.findOne({ phoneNumber: cleanNumber });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists'
      });
    }

    const userName = fullName || name;

    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const user = await User.create({
      fullName: userName,
      name: userName,
      displayName: userName,
      username: userName,
      email,
      phoneNumber: cleanNumber,
      password: hashedPassword,
      role: 'doctor',
      specialization,
      qualification: qualification || '',
      experience: parseInt(experience) || 0,
      clinicName,
      consultationFee: parseInt(consultationFee) || 500,
      isVerified: true,
      isApproved: false,
      subscription: false
    });

    console.log(`✅ User created: ${user._id}`);

    const doctorData = {
      userId: user._id,
      fullName: userName,
      name: userName,
      email: email,
      phoneNumber: cleanNumber,
      specialization: specialization,
      qualification: qualification || '',
      experience: parseInt(experience) || 0,
      consultationFee: parseInt(consultationFee) || 500,
      clinicName: clinicName,
      clinicAddress: clinicAddress || '',
      registrationNumber: registrationNumber || `REG${Date.now()}`,
      isApproved: false,
      approvalStatus: 'pending'
    };

    const doctor = await Doctor.create(doctorData);
    console.log(`✅ Doctor document created: ${doctor._id}`);

    const token = jwtService.generateToken({
      userId: user._id,
      phoneNumber: user.phoneNumber,
      role: user.role,
      doctorId: doctor._id
    });

    const userResponse = {
      id: user._id,
      _id: user._id,
      fullName: user.fullName,
      name: user.name,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      specialization: user.specialization,
      qualification: user.qualification,
      experience: user.experience,
      clinicName: user.clinicName,
      consultationFee: user.consultationFee,
      isApproved: user.isApproved,
      subscription: user.subscription,
      doctorDocumentId: doctor._id,
      doctorId: doctor._id,
      doctor: {
        _id: doctor._id,
        name: doctor.fullName || doctor.name,
        fullName: doctor.fullName || doctor.name,
        specialization: doctor.specialization,
        consultationFee: doctor.consultationFee,
        clinicName: doctor.clinicName,
        isApproved: doctor.isApproved
      }
    };

    res.status(201).json({
      success: true,
      message: 'Doctor registration successful. Pending approval.',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('❌ Doctor registration error:', error);
    next(error);
  }
};

// Check if user exists
exports.checkUserExists = async (req, res, next) => {
  try {
    const { phoneNumber } = req.params;
    const cleanNumber = phoneNumber.replace(/[\s\-()]/g, '');
    
    const user = await User.findOne({ phoneNumber: cleanNumber });
    
    let doctorDoc = null;
    if (user && user.role === 'doctor') {
      doctorDoc = await Doctor.findOne({ userId: user._id });
    }
    
    res.status(200).json({
      success: true,
      exists: !!user,
      user: user ? {
        id: user._id,
        fullName: user.fullName,
        name: user.name,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isApproved: user.isApproved || false,
        doctorDocumentId: doctorDoc ? doctorDoc._id : null,
        doctorId: doctorDoc ? doctorDoc._id : null
      } : null
    });
  } catch (error) {
    next(error);
  }
};

// Get current user profile
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let doctorDoc = null;
    if (user.role === 'doctor') {
      doctorDoc = await Doctor.findOne({ userId: user._id });
    }

    const userData = {
      id: user._id,
      _id: user._id,
      fullName: user.fullName,
      name: user.name || user.fullName,
      displayName: user.displayName || user.fullName,
      username: user.username || user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      specialization: user.specialization,
      qualification: user.qualification,
      experience: user.experience,
      clinicName: user.clinicName,
      consultationFee: user.consultationFee,
      isVerified: user.isVerified,
      isApproved: user.isApproved,
      subscription: user.subscription
    };

    if (doctorDoc) {
      userData.doctorDocumentId = doctorDoc._id;
      userData.doctorId = doctorDoc._id;
      userData.doctor = {
        _id: doctorDoc._id,
        name: doctorDoc.fullName || doctorDoc.name,
        fullName: doctorDoc.fullName || doctorDoc.name,
        specialization: doctorDoc.specialization,
        consultationFee: doctorDoc.consultationFee,
        clinicName: doctorDoc.clinicName,
        isApproved: doctorDoc.isApproved,
        profileImage: doctorDoc.profileImage
      };
      if (doctorDoc.fullName || doctorDoc.name) {
        userData.fullName = doctorDoc.fullName || doctorDoc.name;
        userData.name = doctorDoc.fullName || doctorDoc.name;
        userData.displayName = doctorDoc.fullName || doctorDoc.name;
      }
    }

    res.status(200).json({
      success: true,
      user: userData,
      doctorProfile: doctorDoc
    });
  } catch (error) {
    next(error);
  }
};

// Update user profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { fullName, name, email, specialization, qualification, experience, clinicName, consultationFee } = req.body;
    
    const updates = {
      fullName: fullName || name,
      name: fullName || name,
      displayName: fullName || name,
      username: fullName || name,
      email: email
    };

    if (req.user.role === 'doctor') {
      updates.specialization = specialization;
      updates.qualification = qualification;
      updates.experience = experience;
      updates.clinicName = clinicName;
      updates.consultationFee = consultationFee;
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updates,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role === 'doctor') {
      const doctorUpdates = {
        fullName: fullName || name,
        name: fullName || name,
        specialization: specialization,
        qualification: qualification,
        experience: experience,
        clinicName: clinicName,
        consultationFee: consultationFee
      };
      await Doctor.findOneAndUpdate(
        { userId: user._id },
        doctorUpdates,
        { new: true }
      );
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        name: user.name,
        displayName: user.displayName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        specialization: user.specialization,
        qualification: user.qualification,
        experience: user.experience,
        clinicName: user.clinicName,
        consultationFee: user.consultationFee,
        isVerified: user.isVerified,
        isApproved: user.isApproved,
        subscription: user.subscription
      }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Approve doctor
exports.approveDoctor = async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    
    const user = await User.findByIdAndUpdate(
      doctorId,
      { isApproved: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    await Doctor.findOneAndUpdate(
      { userId: doctorId },
      { 
        isApproved: true, 
        approvalStatus: 'approved' 
      }
    );

    res.status(200).json({
      success: true,
      message: 'Doctor approved successfully',
      doctor: user
    });
  } catch (error) {
    next(error);
  }
};

// Get all approved doctors
exports.getAllDoctors = async (req, res, next) => {
  try {
    const doctors = await User.find({ 
      role: 'doctor', 
      isApproved: true 
    });

    res.status(200).json({
      success: true,
      count: doctors.length,
      doctors: doctors.map(doctor => ({
        id: doctor._id,
        fullName: doctor.fullName,
        name: doctor.name,
        email: doctor.email,
        phoneNumber: doctor.phoneNumber,
        role: doctor.role,
        specialization: doctor.specialization,
        qualification: doctor.qualification,
        experience: doctor.experience,
        clinicName: doctor.clinicName,
        consultationFee: doctor.consultationFee,
        isApproved: doctor.isApproved,
        subscription: doctor.subscription
      }))
    });
  } catch (error) {
    next(error);
  }
};