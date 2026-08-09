// Backend/src/routes/review.routes.js
const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const { protect } = require('../middleware/auth.middleware');

// ============ CREATE REVIEW ============
router.post('/', protect, async (req, res) => {
  try {
    const { doctorId, patientId, rating, review, comment } = req.body;
    
    console.log('📝 Creating review:', { doctorId, patientId, rating });
    
    if (!doctorId || !patientId) {
      return res.status(400).json({
        success: false,
        message: 'Doctor ID and Patient ID are required'
      });
    }
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }
    
    // Check if doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }
    
    // Check if patient exists
    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }
    
    // Check if review already exists
    const existingReview = await Review.findOne({ doctorId, patientId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this doctor'
      });
    }
    
    // Create review
    const newReview = new Review({
      doctorId,
      patientId,
      patientName: patient.fullName || patient.name || 'Patient',
      rating: parseInt(rating),
      review: review || comment || '',
      comment: review || comment || '',
      createdAt: new Date()
    });
    
    await newReview.save();
    
    // Update doctor's rating
    const allReviews = await Review.find({ doctorId });
    const totalReviews = allReviews.length;
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews;
    
    await Doctor.findByIdAndUpdate(doctorId, {
      rating: parseFloat(avgRating.toFixed(1)),
      totalReviews: totalReviews,
      averageRating: parseFloat(avgRating.toFixed(1))
    });
    
    console.log('✅ Review created successfully');
    
    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: newReview
    });
    
  } catch (error) {
    console.error('❌ Error creating review:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============ GET REVIEWS FOR DOCTOR ============
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { limit = 20, page = 1 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const reviews = await Review.find({ doctorId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Review.countDocuments({ doctorId });
    
    res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============ GET REVIEW STATS ============
router.get('/doctor/:doctorId/stats', async (req, res) => {
  try {
    const { doctorId } = req.params;
    
    const reviews = await Review.find({ doctorId });
    const total = reviews.length;
    
    if (total === 0) {
      return res.status(200).json({
        success: true,
        data: {
          average: 0,
          total: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        }
      });
    }
    
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    
    reviews.forEach(review => {
      const rating = review.rating || 0;
      if (rating >= 1 && rating <= 5) {
        distribution[rating] = (distribution[rating] || 0) + 1;
        sum += rating;
      }
    });
    
    const average = sum / total;
    
    res.status(200).json({
      success: true,
      data: {
        average: parseFloat(average.toFixed(1)),
        total,
        distribution
      }
    });
    
  } catch (error) {
    console.error('Error fetching review stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============ DELETE REVIEW ============
router.delete('/:reviewId', protect, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.userId;
    
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }
    
    // Check if user is the author or admin
    if (review.patientId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this review'
      });
    }
    
    await review.deleteOne();
    
    // Update doctor's rating
    const allReviews = await Review.find({ doctorId: review.doctorId });
    const total = allReviews.length;
    let avgRating = 0;
    if (total > 0) {
      avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / total;
    }
    
    await Doctor.findByIdAndUpdate(review.doctorId, {
      rating: parseFloat(avgRating.toFixed(1)),
      totalReviews: total,
      averageRating: parseFloat(avgRating.toFixed(1))
    });
    
    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;