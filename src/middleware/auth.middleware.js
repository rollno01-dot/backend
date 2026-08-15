const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  try {
    let token;

    // ✅ Check for token in headers
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // ✅ Also check for token in cookies (optional)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route",
      });
    }

    try {
      // ✅ Verify token with proper secret
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "your-secret-key"
      );

      // ✅ Get userId from decoded token (handle both 'userId' and 'id')
      const userId = decoded.userId || decoded.id || decoded._id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Invalid token: user ID not found",
        });
      }

      // ✅ Find user and exclude password
      const user = await User.findById(userId).select("-password");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      // ✅ Set user object with all necessary fields
      req.user = {
        userId: user._id,
        id: user._id,  // Also set id for compatibility
        phoneNumber: user.phoneNumber,
        role: user.role || "patient",
        email: user.email,
        fullName: user.fullName || user.name,
      };

      // ✅ Also set user directly for convenience
      req.userData = user;

      next();
    } catch (error) {
      console.error("❌ Token verification error:", error.message);
      
      // ✅ Specific error messages for different token issues
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token has expired, please login again",
        });
      }
      
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token format",
        });
      }

      return res.status(401).json({
        success: false,
        message: "Token invalid or expired",
      });
    }
  } catch (error) {
    console.error("❌ Auth middleware error:", error);
    next(error);
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    // ✅ Check if user exists
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // ✅ Check if user has required role
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(', ')}, Current role: ${req.user.role}`,
      });
    }

    next();
  };
};

// ============ OPTIONAL: Check if user is doctor ============
exports.isDoctor = async (req, res, next) => {
  try {
    await exports.protect(req, res, async () => {
      if (req.user.role !== "doctor") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Doctor role required.",
        });
      }
      next();
    });
  } catch (error) {
    next(error);
  }
};

// ============ OPTIONAL: Check if user is patient ============
exports.isPatient = async (req, res, next) => {
  try {
    await exports.protect(req, res, async () => {
      if (req.user.role !== "patient") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Patient role required.",
        });
      }
      next();
    });
  } catch (error) {
    next(error);
  }
};

// ============ OPTIONAL: Check if user is admin ============
exports.isAdmin = async (req, res, next) => {
  try {
    await exports.protect(req, res, async () => {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin role required.",
        });
      }
      next();
    });
  } catch (error) {
    next(error);
  }
};

// ============ OPTIONAL: Get authenticated user ============
exports.getAuthenticatedUser = async (req, res, next) => {
  try {
    await exports.protect(req, res, () => {
      res.status(200).json({
        success: true,
        data: {
          user: {
            id: req.user.userId,
            phoneNumber: req.user.phoneNumber,
            role: req.user.role,
            fullName: req.user.fullName,
            email: req.user.email,
          }
        }
      });
    });
  } catch (error) {
    next(error);
  }
};

// ============ OPTIONAL: Refresh token validation ============
exports.validateRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token required",
      });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "your-secret-key"
    );

    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    req.user = {
      userId: user._id,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error("❌ Refresh token validation error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid refresh token",
    });
  }
};