const Patient = require('../models/Patient');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Doctor = require('../models/Doctor');

// Get patient profile
exports.getPatientProfile = async (req, res, next) => {
  try {
    let patient = await Patient.findOne({ userId: req.user.userId })
      .populate('userId', 'fullName email phoneNumber profileImage');

    if (!patient) {
      // Create patient profile if it doesn't exist
      patient = await Patient.create({
        userId: req.user.userId
      });
      patient = await Patient.populate(patient, {
        path: 'userId',
        select: 'fullName email phoneNumber profileImage'
      });
    }

    res.status(200).json({
      success: true,
      patient
    });
  } catch (error) {
    next(error);
  }
};

// Update patient profile
exports.updatePatientProfile = async (req, res, next) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { userId: req.user.userId },
      req.body,
      { new: true, runValidators: true }
    ).populate('userId', 'fullName email phoneNumber profileImage');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      patient
    });
  } catch (error) {
    next(error);
  }
};

// Get patient appointments
exports.getPatientAppointments = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId });
    
    const appointments = await Booking.find({ patientId: patient._id })
      .populate({
        path: 'doctorId',
        populate: {
          path: 'userId',
          select: 'fullName'
        }
      })
      .sort({ appointmentDate: -1 });

    res.status(200).json({
      success: true,
      appointments
    });
  } catch (error) {
    next(error);
  }
};

// Add medical history
exports.addMedicalHistory = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId });
    
    patient.medicalHistory.push(req.body);
    await patient.save();

    res.status(200).json({
      success: true,
      message: 'Medical history added',
      medicalHistory: patient.medicalHistory
    });
  } catch (error) {
    next(error);
  }
};