// Backend/src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

// Validation rules
const sendOTPValidation = [
  body('phoneNumber')
    .notEmpty().withMessage('Phone number is required')
    .isMobilePhone().withMessage('Invalid phone number')
];

const verifyOTPValidation = [
  body('phoneNumber')
    .notEmpty().withMessage('Phone number is required')
    .isMobilePhone().withMessage('Invalid phone number'),
  body('otp')
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
];

const doctorLoginValidation = [
  body('phoneNumber')
    .notEmpty().withMessage('Phone number is required')
    .isMobilePhone().withMessage('Invalid phone number'),
  body('password')
    .notEmpty().withMessage('Password is required')
];

const doctorRegistrationValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phoneNumber')
    .notEmpty().withMessage('Phone number is required')
    .isMobilePhone().withMessage('Invalid phone number'),
  body('specialization').notEmpty().withMessage('Specialization is required'),
  body('qualification').optional(),
  body('experience').optional(),
  body('clinicName').notEmpty().withMessage('Clinic/Hospital name is required')
];

// Routes
router.get('/check-user/:phoneNumber', authController.checkUserExists);
router.post('/send-otp', sendOTPValidation, authController.sendOTP);
router.post('/verify-otp', verifyOTPValidation, authController.verifyOTP);
router.post('/doctor/login', doctorLoginValidation, authController.doctorLogin);
router.post('/doctor/register', doctorRegistrationValidation, authController.registerDoctor);
router.get('/profile', protect, authController.getProfile);
router.put('/profile', protect, authController.updateProfile);
router.get('/doctors', authController.getAllDoctors);
router.put('/approve-doctor/:doctorId', protect, authController.approveDoctor);

module.exports = router;