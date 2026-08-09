const Doctor = require('../models/Doctor');
const User = require('../models/User');

// Search doctors
exports.searchDoctors = async (req, res, next) => {
  try {
    const {
      specialization,
      city,
      name,
      minRating,
      maxFee,
      page = 1,
      limit = 10
    } = req.query;

    const query = { approvalStatus: 'approved', isApproved: true };

    // Build search query
    if (specialization) {
      query.specialization = { $regex: specialization, $options: 'i' };
    }

    if (city) {
      query['clinicAddress.city'] = { $regex: city, $options: 'i' };
    }

    if (minRating) {
      query.rating = { $gte: parseFloat(minRating) };
    }

    if (maxFee) {
      query.consultationFee = { $lte: parseFloat(maxFee) };
    }

    if (name) {
      // Search by doctor name through userId reference
      const users = await User.find({
        fullName: { $regex: name, $options: 'i' },
        role: 'doctor'
      }).select('_id');
      
      const userIds = users.map(u => u._id);
      query.userId = { $in: userIds };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const doctors = await Doctor.find(query)
      .populate('userId', 'fullName profileImage')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ rating: -1 });

    const total = await Doctor.countDocuments(query);

    res.status(200).json({
      success: true,
      doctors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get doctor by ID
exports.getDoctorById = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id)
      .populate('userId', 'fullName email phoneNumber profileImage');

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    res.status(200).json({
      success: true,
      doctor
    });
  } catch (error) {
    next(error);
  }
};

// Get specializations list
exports.getSpecializations = async (req, res, next) => {
  try {
    const specializations = await Doctor.distinct('specialization');
    
    res.status(200).json({
      success: true,
      specializations
    });
  } catch (error) {
    next(error);
  }
};

// Get top rated doctors
exports.getTopRatedDoctors = async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;

    const doctors = await Doctor.find({ 
      approvalStatus: 'approved',
      rating: { $gt: 0 }
    })
      .populate('userId', 'fullName profileImage')
      .sort({ rating: -1, totalReviews: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      doctors
    });
  } catch (error) {
    next(error);
  }
};