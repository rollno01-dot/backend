const { validationResult } = require('express-validator');

/**
 * Validate middleware
 * @param {Array} validations - Array of express-validator validations
 * @returns {Function} Express middleware
 */
exports.validate = (validations) => {
  return async (req, res, next) => {
    try {
      // Run all validations
      for (let validation of validations) {
        const result = await validation.run(req);
        if (!result.isEmpty()) break;
      }

      // Check for validation errors
      const errors = validationResult(req);
      
      if (errors.isEmpty()) {
        return next();
      }

      // Format errors for better client-side handling
      const formattedErrors = errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value,
        location: error.location
      }));

      // Log validation errors in development
      if (process.env.NODE_ENV === 'development') {
        console.log('❌ Validation Errors:', {
          path: req.path,
          method: req.method,
          errors: formattedErrors,
          body: req.body
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formattedErrors,
        count: formattedErrors.length
      });

    } catch (error) {
      console.error('❌ Validation middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Validation processing failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Custom validators for common use cases
 */
exports.customValidators = {
  // Phone number validation (supports multiple formats)
  isPhoneNumber: (value, options = {}) => {
    if (!value) return false;
    
    const phoneRegex = options.strict 
      ? /^[0-9]{10}$/  // Strict: exactly 10 digits
      : /^[0-9+\-\s()]{10,15}$/;  // Flexible: allows +, -, spaces, parentheses
    
    const cleaned = value.replace(/[\s\-()]/g, '');
    return phoneRegex.test(value) && /^[0-9]{10,15}$/.test(cleaned);
  },

  // OTP validation
  isOTP: (value, length = 6) => {
    if (!value) return false;
    const otpRegex = new RegExp(`^[0-9]{${length}}$`);
    return otpRegex.test(value.toString());
  },

  // Future date validation
  isFutureDate: (value, options = {}) => {
    if (!value) return false;
    
    const date = new Date(value);
    const now = new Date();
    
    if (isNaN(date.getTime())) return false;
    
    // Optional: exclude today
    if (options.excludeToday) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const compareDate = new Date(date);
      compareDate.setHours(0, 0, 0, 0);
      return compareDate > today;
    }
    
    return date > now;
  },

  // Past date validation
  isPastDate: (value) => {
    if (!value) return false;
    const date = new Date(value);
    const now = new Date();
    return !isNaN(date.getTime()) && date < now;
  },

  // Email validation (more comprehensive)
  isEmail: (value) => {
    if (!value) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(value);
  },

  // Strong password validation
  isStrongPassword: (value) => {
    if (!value) return false;
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(value);
  },

  // Age validation (must be at least 18)
  isAdult: (birthDate) => {
    if (!birthDate) return false;
    const today = new Date();
    const birth = new Date(birthDate);
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      return age - 1 >= 18;
    }
    return age >= 18;
  },

  // Time slot validation (e.g., "09:00 AM" format)
  isTimeSlot: (value) => {
    if (!value) return false;
    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i;
    return timeRegex.test(value);
  },

  // Working hours validation
  isWorkingHour: (value, startHour = 9, endHour = 17) => {
    if (!value) return false;
    const [hours, minutes] = value.split(':').map(Number);
    return hours >= startHour && hours < endHour;
  },

  // MongoDB ObjectId validation
  isObjectId: (value) => {
    if (!value) return false;
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    return objectIdRegex.test(value);
  },

  // URL validation
  isURL: (value, options = {}) => {
    if (!value) return false;
    try {
      const url = new URL(value);
      if (options.protocols && !options.protocols.includes(url.protocol)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  // Indian PIN code validation
  isIndianPIN: (value) => {
    if (!value) return false;
    const pinRegex = /^[1-9][0-9]{5}$/;
    return pinRegex.test(value);
  },

  // Range validation
  isInRange: (value, min, max) => {
    const num = Number(value);
    return !isNaN(num) && num >= min && num <= max;
  },

  // File type validation
  isAllowedFileType: (filename, allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf']) => {
    if (!filename) return false;
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return allowedTypes.includes(ext);
  }
};

/**
 * Common validation chains for reuse
 */
exports.commonValidations = {
  // Add these if you want pre-built validation chains
  // You can use them like: body('email').custom(commonValidations.email)
};

// Example usage in your routes:
/*
const { body } = require('express-validator');
const { validate, customValidators } = require('../middleware/validation.middleware');

router.post('/register',
  validate([
    body('email').custom(customValidators.isEmail),
    body('phone').custom(customValidators.isPhoneNumber),
    body('password').custom(customValidators.isStrongPassword),
    body('dob').custom(customValidators.isAdult)
  ]),
  authController.register
);
*/