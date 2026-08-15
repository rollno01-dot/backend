const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

// ================= NO-CACHE MIDDLEWARE =================
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.removeHeader('ETag');
  next();
});

// ================= PUBLIC ROUTES =================
// ✅ FIXED: More specific routes first
router.get('/slots/:doctorId', bookingController.getAvailableSlots);
router.get('/slots', bookingController.getAvailableSlots);
router.get('/check/:doctorId/:date/:slotNumber', bookingController.checkSlotAvailability);

// ================= PROTECTED ROUTES =================
router.use(protect);

// ================= DOCTOR SPECIFIC ROUTES (MUST COME BEFORE /:bookingId) =================
// ✅ FIXED: Doctor bookings route - this was causing the 404
router.get('/doctor/bookings/:doctorId', authorize('doctor'), bookingController.getBookingsByDate);
router.get('/doctor/bookings', authorize('doctor'), bookingController.getDoctorBookings);

// Schedule sync routes
router.post('/schedule/:doctorId/sync', authorize('doctor'), bookingController.saveDoctorSchedule);

// ✅ FIXED: Generate slots (should come BEFORE /:bookingId)
router.post('/generate-slots/:doctorId', authorize('doctor'), bookingController.generateSlotsForDateRange);

// Offline appointment (should come BEFORE /:bookingId)
router.post('/offline', authorize('doctor'), bookingController.addOfflineAppointment);

// ================= PATIENT APPOINTMENT ROUTES =================
router.get('/patient/:patientId', bookingController.getPatientAppointments);
router.get('/patient/:patientId/stats', bookingController.getPatientStats);
router.get('/phone/:phone', bookingController.getAppointmentsByPhone);

// ================= USER BOOKINGS =================
router.get('/my-bookings', bookingController.getUserBookings);

// ================= BOOKING MANAGEMENT (WITH ID PARAM - MUST COME LAST) =================
router.post('/book', bookingController.bookAppointment);
router.get('/:bookingId', bookingController.getAppointmentById);
router.put('/:bookingId/cancel', bookingController.cancelBooking);
router.put('/:bookingId/reschedule', bookingController.rescheduleAppointment);
router.post('/:bookingId/review', bookingController.addReview);

// Doctor only routes
router.put('/:bookingId/status', authorize('doctor'), bookingController.updateBookingStatus);
router.put('/:bookingId/complete', authorize('doctor'), bookingController.completeAppointment);
router.post('/:bookingId/prescription', authorize('doctor'), bookingController.addPrescription);

// Queue management
router.post('/queue/join', bookingController.joinWaitingQueue);
router.get('/queue/position/:doctorId', bookingController.getQueuePosition);

module.exports = router;