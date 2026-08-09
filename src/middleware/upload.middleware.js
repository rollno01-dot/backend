const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create upload directories if they don't exist
const uploadDir = path.join(__dirname, '../../uploads');
const profilesDir = path.join(uploadDir, 'profiles');
const documentsDir = path.join(uploadDir, 'documents');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 Created uploads directory:', uploadDir);
}

if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
  console.log('📁 Created profiles directory:', profilesDir);
}

if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
  console.log('📁 Created documents directory:', documentsDir);
}

// Configure storage based on file type
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine destination based on file field name
    if (file.fieldname === 'profileImage' || file.fieldname === 'profile') {
      cb(null, profilesDir);
    } else if (file.fieldname === 'documents' || file.fieldname === 'document') {
      cb(null, documentsDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: function (req, file, cb) {
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    
    // Clean the fieldname and add unique suffix
    let prefix = file.fieldname;
    if (file.fieldname === 'profileImage') prefix = 'profile';
    
    // If user ID is available in request, add it to filename
    const userId = req.user?.id || req.user?.userId || 'unknown';
    const filename = `${prefix}-${userId}-${uniqueSuffix}${ext}`;
    
    cb(null, filename);
  }
});

// File filter for images only (for profile images)
const imageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// File filter for documents (images, PDFs, docs)
const documentFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only images, PDFs, and documents are allowed'));
  }
};

// General file filter (for all uploads)
const generalFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: images, PDFs, and documents'));
  }
};

// Create multer instances for different use cases
const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
    files: 10 // Maximum 10 files per request
  },
  fileFilter: generalFilter
});

// For profile image uploads (single file, images only)
const uploadProfileImage = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter
}).single('profileImage');

// For multiple document uploads
const uploadDocuments = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB for documents
    files: 10
  },
  fileFilter: documentFilter
}).array('documents', 10);

// For single file upload (general)
const uploadSingle = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: generalFilter
}).single('file');

// For multiple files upload (general)
const uploadMultiple = multer({
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024,
    files: 10
  },
  fileFilter: generalFilter
}).array('files', 10);

// Export all configurations
module.exports = upload;
module.exports.uploadProfileImage = uploadProfileImage;
module.exports.uploadDocuments = uploadDocuments;
module.exports.uploadSingle = uploadSingle;
module.exports.uploadMultiple = uploadMultiple;
module.exports.uploadDir = uploadDir;
module.exports.profilesDir = profilesDir;
module.exports.documentsDir = documentsDir;