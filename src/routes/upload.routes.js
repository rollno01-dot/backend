const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const { protect } = require('../middleware/auth.middleware');

// Upload doctor profile image
router.post('/doctor-profile', protect, upload.single('profileImage'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Construct the full URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

    console.log('✅ Image uploaded successfully:', imageUrl);
    console.log('📸 File details:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: imageUrl,
      url: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('❌ Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Upload multiple documents
router.post('/documents', protect, upload.array('documents', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const documents = req.files.map(file => ({
      url: `${baseUrl}/uploads/${file.filename}`,
      name: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype
    }));

    console.log('✅ Documents uploaded successfully:', documents.length);

    res.status(200).json({
      success: true,
      message: 'Documents uploaded successfully',
      documents: documents
    });
  } catch (error) {
    console.error('❌ Error uploading documents:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;