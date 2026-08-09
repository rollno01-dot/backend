const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Booking = require("../models/Booking");
const Doctor = require("../models/Doctor");
const Subscription = require("../models/Subscription");

const { protect, authorize } = require("../middleware/auth.middleware");

// ================= FORCE CREATE ADMIN =================
router.post("/auth/force-create-admin", async (req, res) => {
  try {
    const { email = "admin@doctime.com", password = "admin123", name = "Admin User" } = req.body;

    console.log("🔧 FORCE CREATE ADMIN");
    console.log("📧 Email:", email);
    console.log("🔑 Password provided:", !!password);

    // Delete ALL admin users
    await User.deleteMany({ role: "admin" });
    console.log("🗑️ Cleared all admins");

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("🔑 Password hashed");

    // Create admin with password
    const admin = await User.create({
      fullName: name,
      name: name,
      displayName: name,
      username: name,
      email: email.toLowerCase().trim(),
      phoneNumber: "9999999999",
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      isApproved: true,
      isWalkIn: false,
    });

    console.log("✅ Admin created:", admin._id);

    // Verify
    const verify = await User.findById(admin._id).select("+password");
    console.log("🔍 Verified password exists:", !!verify?.password);
    console.log("🔍 Password length:", verify?.password?.length || 0);

    // Generate token
    const token = jwt.sign(
      {
        userId: admin._id,
        email: admin.email,
        role: admin.role,
      },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Admin created successfully",
      token: token,
      admin: {
        id: admin._id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
      },
      credentials: {
        email: email.toLowerCase().trim(),
        password: password,
      },
    });
  } catch (error) {
    console.error("❌ Error creating admin:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack,
    });
  }
});

// ================= ADMIN LOGIN =================
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("🔐 Admin login attempt for:", email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find admin with password explicitly selected
    const admin = await User.findOne({
      email: email.toLowerCase().trim(),
      role: "admin",
    }).select("+password");

    if (!admin) {
      console.log("❌ Admin not found:", email);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    console.log("✅ Admin found:", {
      id: admin._id,
      email: admin.email,
      role: admin.role,
      hasPassword: !!admin.password,
      passwordLength: admin.password?.length || 0,
    });

    // If no password, set one (for existing admins without password)
    if (!admin.password) {
      console.log("⚠️ Admin has no password, setting one...");
      const salt = await bcrypt.genSalt(10);
      admin.password = await bcrypt.hash(password, 10);
      await admin.save();
      console.log("✅ Password set for admin");
      
      // Generate token
      const token = jwt.sign(
        {
          userId: admin._id,
          email: admin.email,
          role: admin.role,
        },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        token: token,
        admin: {
          id: admin._id,
          fullName: admin.fullName || "Admin",
          email: admin.email,
          role: admin.role,
        },
      });
    }

    // Verify password
    const isMatch = await admin.comparePassword(password);
    console.log("🔐 Password match:", isMatch);

    if (!isMatch) {
      console.log("❌ Invalid password for admin:", email);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate token
    const token = jwt.sign(
      {
        userId: admin._id,
        email: admin.email,
        role: admin.role,
      },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    console.log("✅ Admin login successful:", email);

    res.json({
      success: true,
      token: token,
      admin: {
        id: admin._id,
        fullName: admin.fullName || "Admin",
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("❌ Admin login error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// ================= CHECK ADMIN =================
router.get("/auth/check", async (req, res) => {
  try {
    const admin = await User.findOne({ role: "admin" }).select("+password");
    
    res.json({
      success: true,
      hasAdmin: !!admin,
      admin: admin ? {
        id: admin._id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
        hasPassword: !!admin.password,
        passwordLength: admin.password?.length || 0,
      } : null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ================= TEST ADMIN LOGIN =================
router.post("/auth/test-login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("🧪 TEST LOGIN:", { email });

    const admin = await User.findOne({
      email: email?.toLowerCase().trim(),
      role: "admin",
    }).select("+password");

    if (!admin) {
      return res.json({
        success: false,
        message: "Admin not found",
        debug: { found: false },
      });
    }

    let isMatch = false;
    if (admin.password) {
      try {
        isMatch = await bcrypt.compare(password || "", admin.password);
      } catch (e) {
        console.error("Compare error:", e);
      }
    }

    res.json({
      success: true,
      debug: {
        found: true,
        hasPassword: !!admin.password,
        passwordLength: admin.password?.length || 0,
        isMatch: isMatch,
        adminEmail: admin.email,
        adminRole: admin.role,
        adminId: admin._id,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack,
    });
  }
});

// ================= REST OF YOUR ROUTES =================

// Dashboard Stats
router.get(
  "/dashboard/stats",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const totalDoctors = await User.countDocuments({ role: "doctor" });
      const pendingDoctors = await User.countDocuments({
        role: "doctor",
        isApproved: false
      });
      const totalPatients = await User.countDocuments({ role: "patient" });

      const startMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      );

      const monthlyBookings = await Booking.countDocuments({
        createdAt: { $gte: startMonth }
      });

      const activeSubscriptions = await Subscription.countDocuments({ 
        status: 'active',
        endDate: { $gt: new Date() }
      });
      
      const expiredSubscriptions = await Subscription.countDocuments({
        endDate: { $lte: new Date() }
      });

      const consultationFee = 500;
      const monthlyRevenue = monthlyBookings * consultationFee;
      const pendingPayouts = Math.round(monthlyRevenue * 0.7);

      res.json({
        success: true,
        stats: {
          totalDoctors,
          pendingDoctors,
          totalPatients,
          monthlyRevenue,
          pendingPayouts,
          activeSubscriptions,
          expiredSubscriptions,
          totalSubscriptions: activeSubscriptions + expiredSubscriptions
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Get all doctors
router.get(
  "/doctors",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const users = await User.find({ role: "doctor" });
      const doctorProfiles = await Doctor.find({});
      
      const profileMap = {};
      doctorProfiles.forEach(profile => {
        if (profile.userId) {
          profileMap[profile.userId.toString()] = profile;
        }
      });

      const doctors = users.map(user => {
        const profile = profileMap[user._id.toString()];
        return {
          id: user._id,
          doctorProfileId: profile?._id || null,
          fullName: profile?.fullName || user.fullName,
          specialization: profile?.specialization || user.specialization || "Not specified",
          phoneNumber: user.phoneNumber,
          email: user.email,
          isApproved: user.isApproved,
          approvalStatus: user.isApproved ? 'approved' : 'pending',
          subscription: user.subscription || false,
          experience: profile?.experience || 0,
          qualification: profile?.qualification || '',
          clinicName: profile?.clinicName || '',
          consultationFee: profile?.consultationFee || 500,
          profileImage: profile?.profileImage || null,
          createdAt: user.createdAt
        };
      });

      res.json({
        success: true,
        doctors
      });
    } catch (error) {
      console.error('❌ Error fetching doctors:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Approve doctor
router.put(
  "/doctors/:userId/approve",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      
      let doctorProfile = await Doctor.findOne({ userId: userId });
      if (doctorProfile) {
        doctorProfile.isApproved = true;
        doctorProfile.approvalStatus = 'approved';
        doctorProfile.approvedAt = new Date();
        doctorProfile.approvedBy = req.user.userId;
        await doctorProfile.save();
      }
      
      user.isApproved = true;
      await user.save();

      res.json({
        success: true,
        message: "Doctor approved successfully",
        data: {
          userId: user._id,
          doctorProfileId: doctorProfile?._id || null,
          name: user.fullName,
          isApproved: true
        }
      });
    } catch (error) {
      console.error('❌ Error approving doctor:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Reject doctor
router.put(
  "/doctors/:userId/reject",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      
      const doctorProfile = await Doctor.findOne({ userId: userId });
      if (doctorProfile) {
        doctorProfile.isApproved = false;
        doctorProfile.approvalStatus = 'rejected';
        doctorProfile.rejectionReason = reason || 'Not specified';
        doctorProfile.rejectedAt = new Date();
        doctorProfile.rejectedBy = req.user.userId;
        await doctorProfile.save();
      }
      
      user.isApproved = false;
      await user.save();

      res.json({
        success: true,
        message: "Doctor rejected successfully"
      });
    } catch (error) {
      console.error('❌ Error rejecting doctor:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// ================= SUBSCRIPTION ROUTES =================
// Get all subscriptions
router.get(
  "/subscriptions",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const subscriptions = await Subscription.find({})
        .populate({
          path: 'doctorId',
          select: 'fullName name email phoneNumber specialization profileImage'
        })
        .sort({ createdAt: -1 });

      const formattedSubscriptions = subscriptions.map(sub => {
        const now = new Date();
        const daysRemaining = sub.endDate ? Math.ceil((sub.endDate - now) / (1000 * 60 * 60 * 24)) : 0;
        
        let status = 'Inactive';
        if (sub.status === 'active') {
          if (daysRemaining <= 0) status = 'Expired';
          else if (daysRemaining <= 7) status = 'Expiring Soon';
          else status = 'Active';
        } else if (sub.status === 'pending') {
          status = 'Pending';
        } else if (sub.status === 'cancelled') {
          status = 'Cancelled';
        }

        return {
          id: sub._id,
          _id: sub._id,
          doctorId: sub.doctorId?._id,
          doctorName: sub.doctorId?.fullName || sub.doctorId?.name || 'Unknown Doctor',
          doctor: sub.doctorId ? {
            id: sub.doctorId._id,
            name: sub.doctorId.fullName || sub.doctorId.name,
            email: sub.doctorId.email,
            phoneNumber: sub.doctorId.phoneNumber,
            specialization: sub.doctorId.specialization
          } : null,
          plan: sub.planType === 'free' ? 'Free' : 
                sub.planType === 'basic' ? 'Basic' : 'Premium',
          planType: sub.planType,
          price: sub.price || 0,
          currency: sub.currency || 'INR',
          status,
          startDate: sub.startDate,
          expiryDate: sub.endDate,
          endDate: sub.endDate,
          daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
          paymentStatus: sub.paymentStatus,
          paymentMethod: sub.paymentMethod || 'N/A',
          transactionId: sub.transactionId,
          autoRenew: sub.autoRenew || false,
          features: sub.features || {},
          createdAt: sub.createdAt,
          updatedAt: sub.updatedAt
        };
      });

      res.json({
        success: true,
        count: formattedSubscriptions.length,
        subscriptions: formattedSubscriptions,
        data: formattedSubscriptions
      });
    } catch (error) {
      console.error('❌ Error fetching subscriptions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch subscriptions',
        error: error.message
      });
    }
  }
);

// ... (add other subscription routes as needed)

// Monthly payments
router.get(
  "/payments/monthly/:year/:month",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { year, month } = req.params;

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const doctors = await User.find({
        role: "doctor",
        isApproved: true
      });

      const payments = [];

      for (const doctor of doctors) {
        const bookings = await Booking.find({
          doctorId: doctor._id.toString(),
          createdAt: { $gte: startDate, $lte: endDate }
        });

        const patientsCount = bookings.length;
        const consultationFee = 500;
        const totalPayment = patientsCount * consultationFee;
        const platformFee = Math.round(totalPayment * 0.3);
        const doctorEarning = totalPayment - platformFee;

        payments.push({
          id: doctor._id,
          doctorName: doctor.fullName,
          specialization: doctor.specialization || "General",
          patientsCount,
          totalPayment,
          platformFee,
          doctorEarning
        });
      }

      res.json({
        success: true,
        payments
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

module.exports = router;