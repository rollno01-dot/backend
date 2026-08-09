const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');
const doctorController = require('../controllers/doctor.controller');

// ==================== PUBLIC ROUTES (No Authentication) ====================
// IMPORTANT: Static routes must come BEFORE dynamic routes with :doctorId

// Get specializations list - STATIC ROUTES FIRST
router.get('/public/specialties', doctorController.getSpecializations);
router.get('/public/specializations', doctorController.getSpecializations);

// Search doctors
router.get('/public/search', doctorController.searchDoctors);

// Get popular doctors
router.get('/public/popular', doctorController.getTopRatedDoctors);

// Get nearby doctors
router.get('/public/nearby', doctorController.getNearbyDoctors);

// Get all doctors (public list)
router.get('/list', doctorController.getDoctorsList);
router.get('/all', doctorController.getAllDoctors);

// Debug endpoint
router.get('/debug/:doctorId', doctorController.debugDoctor);

// ==================== PROTECTED ROUTES (Authentication Required) ====================
// These come BEFORE the protect middleware so they don't require auth
// But they are actually public routes that need to be accessible without token

// ==================== PROTECTED ROUTES WITH AUTHENTICATION ====================
// Apply protect middleware for all routes below
router.use(protect);

// ==================== DOCTOR PROFILE MANAGEMENT ====================
// All "my/" routes must come BEFORE any dynamic routes

// Check if doctor profile exists
router.get('/check-profile', doctorController.checkDoctorProfile);

// Get current doctor's profile
router.get('/my/profile', doctorController.getMyProfile);
router.get('/profile', doctorController.getMyProfile);

// Create/Register doctor profile
router.post('/register', upload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'documents', maxCount: 10 }
]), doctorController.registerDoctor);

// Update current doctor's profile
router.put('/my/profile', upload.single('profileImage'), doctorController.updateMyProfile);
router.put('/profile', upload.single('profileImage'), doctorController.updateMyProfile);

// Upload profile image
router.post('/my/image', upload.single('profileImage'), doctorController.uploadProfileImage);

// Upload documents
router.post('/my/documents', upload.array('documents', 10), doctorController.uploadDocuments);
router.delete('/my/documents/:documentUrl', doctorController.deleteDocument);

// ==================== DOCTOR TIMING MANAGEMENT ====================

// Get current doctor's timing
router.get('/my/timing', doctorController.getMyTimings);
router.get('/timing', doctorController.getMyTimings);

// Save current doctor's timing
router.post('/my/timing', doctorController.saveMyTimings);
router.post('/timing', doctorController.saveMyTimings);

// Update current doctor's timing
router.put('/my/timing', doctorController.updateMyTimings);
router.put('/timing', doctorController.updateMyTimings);

// Legacy timing routes
router.post('/my/set-timings', doctorController.setTimings);
router.get('/my/get-timings', doctorController.getTimings);
router.put('/my/slots/:slotId', doctorController.updateSlot);
router.delete('/my/slots/:slotId', doctorController.deleteSlot);

// ==================== DOCTOR DASHBOARD ====================

// Get dashboard stats
router.get('/my/dashboard', doctorController.getMyDashboardStats);
router.get('/dashboard', doctorController.getMyDashboardStats);

// Get appointments - CRITICAL: These must come before any dynamic routes
router.get('/my/appointments', doctorController.getMyAppointments);
router.get('/appointments', doctorController.getMyAppointments);

// Get appointments by date
router.get('/my/appointments/date/:date', doctorController.getMyAppointmentsByDate);

// Update appointment status
router.put('/my/appointments/:appointmentId/status', doctorController.updateAppointmentStatus);

// ==================== DOCTOR EARNINGS ====================

// Get earnings summary
router.get('/my/earnings', doctorController.getMyEarnings);
router.get('/earnings', doctorController.getMyEarnings);
router.get('/my/earnings/summary', doctorController.getEarningsSummary);

// ==================== DOCTOR SUBSCRIPTION ====================

// Get subscription status - CRITICAL: These must come before any dynamic routes
router.get('/my/subscription', doctorController.getMySubscription);
router.get('/subscription', doctorController.getMySubscription);

// Upgrade subscription
router.post('/my/subscription/upgrade', doctorController.upgradeSubscription);

// ==================== DOCTOR PAYMENT REQUESTS ====================

// Request payment withdrawal
router.post('/my/payment-requests', doctorController.requestPayment);

// Get payment requests
router.get('/my/payment-requests', doctorController.getPaymentRequests);

// Get payment request details
router.get('/my/payment-requests/:requestId', doctorController.getPaymentRequestDetails);

// Cancel payment request
router.put('/my/payment-requests/:requestId/cancel', doctorController.cancelPaymentRequest);

// ==================== DOCTOR BANK DETAILS ====================

// Update bank details
router.put('/my/bank-details', doctorController.updateBankDetails);

// Get bank details
router.get('/my/bank-details', doctorController.getBankDetails);

// ==================== DOCTOR STATS ====================

// Get doctor stats (authenticated)
router.get('/my/stats', doctorController.getMyDashboardStats);
router.get('/stats', doctorController.getMyDashboardStats);

// ==================== DYNAMIC ROUTES (with :doctorId) ====================
// These come AFTER all static routes to prevent conflicts

// Get doctor profile by ID (for admin/authorized users)
router.get('/profile/:doctorId', doctorController.getDoctorProfileById);

// Public routes with doctorId - THESE COME AFTER ALL STATIC ROUTES
router.get('/:doctorId', doctorController.getDoctorById);
router.get('/:doctorId/public', doctorController.getDoctorPublic);
router.get('/:doctorId/reviews', doctorController.getDoctorReviews);
router.get('/:doctorId/reviews/stats', doctorController.getDoctorReviewsStats);
router.get('/:doctorId/timing', doctorController.getDoctorTimingById);
router.get('/:doctorId/availability', doctorController.getDoctorAvailability);
router.get('/:doctorId/slots', doctorController.getDoctorSlots);
router.get('/:doctorId/appointments', doctorController.getDoctorAppointmentsById);
router.get('/:doctorId/subscription', doctorController.getDoctorSubscriptionById);
router.get('/:doctorId/stats', doctorController.getDoctorStats);

module.exports = router;