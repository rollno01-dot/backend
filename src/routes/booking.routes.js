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
// Support both query params AND path params for slots
router.get('/slots', bookingController.getAvailableSlots);
router.get('/slots/:doctorId', bookingController.getAvailableSlots);
router.get('/check/:doctorId/:date/:slotNumber', bookingController.checkSlotAvailability);

// ================= PROTECTED ROUTES =================
router.use(protect);

// Schedule sync routes
router.post('/schedule/:doctorId/sync', bookingController.saveDoctorSchedule);

// Patient appointment routes
router.get('/patient/:patientId', bookingController.getPatientAppointments);
router.get('/patient/:patientId/stats', bookingController.getPatientStats);
router.get('/phone/:phone', bookingController.getAppointmentsByPhone);
router.get('/:bookingId', bookingController.getAppointmentById);

// Booking management
router.post('/book', bookingController.bookAppointment);
router.get('/my-bookings', bookingController.getUserBookings);
router.put('/:bookingId/cancel', bookingController.cancelBooking);
router.put('/:bookingId/reschedule', bookingController.rescheduleAppointment);
router.post('/:bookingId/review', bookingController.addReview);

// Doctor only routes
router.put('/:bookingId/status', authorize('doctor'), bookingController.updateBookingStatus);
router.put('/:bookingId/complete', authorize('doctor'), bookingController.completeAppointment);
router.post('/:bookingId/prescription', authorize('doctor'), bookingController.addPrescription);
router.post('/offline', authorize('doctor'), bookingController.addOfflineAppointment);
router.get('/doctor/bookings', authorize('doctor'), bookingController.getDoctorBookings);
router.get('/doctor/bookings/:doctorId', authorize('doctor'), bookingController.getBookingsByDate);
router.post('/generate-slots/:doctorId', authorize('doctor'), bookingController.generateSlotsForDateRange);

// Queue management
router.post('/queue/join', bookingController.joinWaitingQueue);
router.get('/queue/position/:doctorId', bookingController.getQueuePosition);

module.exports = router;