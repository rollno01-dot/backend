module.exports = {
  USER_ROLES: {
    PATIENT: 'patient',
    DOCTOR: 'doctor',
    ADMIN: 'admin'
  },

  APPOINTMENT_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    RESCHEDULED: 'rescheduled'
  },

  PAYMENT_STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded'
  },

  CONSULTATION_TYPES: {
    CLINIC: 'clinic',
    VIDEO: 'video',
    PHONE: 'phone'
  },

  DOCTOR_APPROVAL_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
  },

  SUBSCRIPTION_TYPES: {
    FREE: 'free',
    BASIC: 'basic',
    PREMIUM: 'premium'
  },

  DAYS_OF_WEEK: [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ],

  SPECIALIZATIONS: [
    'Cardiologist',
    'Dermatologist',
    'Pediatrician',
    'Gynecologist',
    'Orthopedic',
    'Neurologist',
    'Psychiatrist',
    'Dentist',
    'ENT Specialist',
    'Ophthalmologist',
    'General Physician'
  ]
};