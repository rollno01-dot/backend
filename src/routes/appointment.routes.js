const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const appointmentController = require('../controllers/appointment.controller');

// All appointment routes require authentication
router.use(protect);

// Get available slots for a doctor
router.get('/slots/:doctorId', appointmentController.getAvailableSlots);

// Book an appointment
router.post('/book', appointmentController.bookAppointment);

// Get patient's appointments
router.get('/patient/:patientId', appointmentController.getPatientAppointments);

// Get appointment by ID
router.get('/:appointmentId', appointmentController.getAppointmentById);

// Cancel appointment
router.put('/:appointmentId/cancel', appointmentController.cancelAppointment);

// Reschedule appointment
router.put('/:appointmentId/reschedule', appointmentController.rescheduleAppointment);

// Add review to appointment
router.post('/:appointmentId/review', appointmentController.addReview);

// Get patient stats
router.get('/patient/:patientId/stats', appointmentController.getPatientStats);

module.exports = router;