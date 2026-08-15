const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./src/routes/auth.routes');
const doctorRoutes = require('./src/routes/doctor.routes');
const adminRoutes = require('./src/routes/admin.routes');
const bookingRoutes = require('./src/routes/booking.routes');
const scheduleRoutes = require('./src/routes/schedule.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const reviewRoutes = require('./src/routes/review.routes');

const errorMiddleware = require('./src/middleware/error.middleware');

const app = express();

// ============ ⭐ FIX: TRUST PROXY (MUST BE FIRST) ============
// Enable trust proxy for rate limiting behind a proxy (Render, Nginx, etc.)
app.set('trust proxy', 1); // Trust first proxy

// ============ ENVIRONMENT VALIDATION ============
// Check for required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'MONGODB_URI',
  'MSG91_AUTH_KEY',
  'MSG91_TEMPLATE_ID',
  'MSG91_SENDER_ID'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.warn('⚠️  MSG91 integration will not work without these variables!');
} else {
  console.log('✅ All required environment variables are set');
}

// ============ SECURITY MIDDLEWARE ============
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false
}));

// ============ CORS CONFIGURATION ============
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://10.94.28.104:5000',
  'http://192.168.1.4:5000',
  'http://api.sevai.in:5000',
  'http://sevai.in:5000',
  'http://120.56.90.113:5000',
  'https://sevai.in',
  'https://www.sevai.in',
  'https://api.sevai.in',
  'https://sevai-api.onrender.com',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked request from: ${origin}`);
      // In development, allow all origins for testing
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(null, true); // Allow anyway but log it
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ============ RATE LIMITING ============
// General rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ⭐ FIX: Skip rate limiting for trusted proxies
  skip: (req) => {
    // Skip rate limiting for internal requests
    return req.ip === '127.0.0.1' || req.ip === '::1';
  }
});
app.use('/api', generalLimiter);

// Stricter rate limiter for OTP endpoints
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 OTP requests per hour
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again after an hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ⭐ FIX: Skip rate limiting for trusted proxies
  skip: (req) => {
    return req.ip === '127.0.0.1' || req.ip === '::1';
  }
});

// Apply OTP rate limiter specifically to OTP routes
app.use('/api/auth/send-otp', otpLimiter);

// ============ BODY PARSING ============
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============ STATIC FILES ============
const uploadsPath = path.join(__dirname, 'uploads');
console.log(`📁 Uploads directory path: ${uploadsPath}`);

// Serve static files
app.use('/uploads', express.static(uploadsPath));
app.use('/uploads/profiles', express.static(path.join(uploadsPath, 'profiles')));

// ============ LOGGING ============
// Use combined logging in production, dev in development
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============ TEST ROUTE FOR DOMAIN VERIFICATION ============
app.get('/api/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is working! 🎉',
    domain: 'sevai.in',
    publicIP: '120.56.90.113',
    localIP: '192.168.1.4',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Detailed health check with database status
app.get('/health/detailed', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  res.status(200).json({
    status: 'OK',
    server: {
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage()
    },
    database: {
      state: dbStates[dbState] || 'unknown',
      connected: dbState === 1
    },
    services: {
      msg91: {
        configured: !!process.env.MSG91_AUTH_KEY,
        templateId: process.env.MSG91_TEMPLATE_ID ? '✅' : '❌',
        senderId: process.env.MSG91_SENDER_ID ? '✅' : '❌'
      }
    },
    timestamp: new Date().toISOString()
  });
});

// ============ ROUTES ============
console.log('📍 Mounting routes...');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);

console.log('✅ All routes mounted');

// ============ 404 HANDLER ============
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ============ ERROR HANDLING ============
app.use(errorMiddleware);

// ============ UNHANDLED REJECTION HANDLER ============
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
  // Don't crash the server in production
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't crash the server in production
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

// ============ DATABASE CONNECTION ============
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/doctor_appointment';
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ Connected to MongoDB');
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// ============ START SERVER ============
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  
  // IMPORTANT: Listen on '0.0.0.0' to accept connections from any IP
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=================================');
    console.log('✅ Server started successfully');
    console.log(`📍 Server running on port: ${PORT}`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`🌐 Network URL: http://192.168.1.4:${PORT}`);
    console.log(`🌐 Public URL: http://120.56.90.113:${PORT}`);
    console.log(`🌐 Domain URL: http://api.sevai.in:${PORT}`);
    console.log(`📁 Uploads: ${uploadsPath}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📱 MSG91 SMS: ${process.env.MSG91_AUTH_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log('=================================\n');
  });

  // Graceful shutdown
  const gracefulShutdown = () => {
    console.log('\n🛑 Received shutdown signal');
    server.close(async () => {
      console.log('📡 HTTP server closed');
      await mongoose.connection.close();
      console.log('🗄️ Database connection closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  return server;
};

// Start the server
startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

module.exports = app;