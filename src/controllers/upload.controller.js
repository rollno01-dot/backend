const fs = require('fs');
const path = require('path');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');
const { getBaseUrl } = require('../utils/urlHelper');

// Upload profile image
exports.uploadProfileImage = (req, res) => {
    try {
        const upload = require('../middleware/upload.middleware');
        upload.uploadProfileImage(req, res, async function(err) {
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message || 'Upload failed'
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            try {
                // Upload to Cloudinary
                const result = await uploadToCloudinary(req.file.path, 'profiles');
                
                // Get user ID from request
                const userId = req.user?.id || req.user?.userId;
                
                // Save to database (you'll need to update your User model)
                // await User.findByIdAndUpdate(userId, { profileImage: result.url });

                res.status(200).json({
                    success: true,
                    message: 'Profile image uploaded successfully',
                    data: {
                        filename: req.file.filename,
                        url: result.url, // Cloudinary URL
                        public_id: result.public_id
                    }
                });
            } catch (uploadError) {
                // Delete local file if Cloudinary fails
                if (req.file && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                throw uploadError;
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Upload failed'
        });
    }
};

// Upload documents
exports.uploadDocuments = (req, res) => {
    try {
        const upload = require('../middleware/upload.middleware');
        upload.uploadDocuments(req, res, async function(err) {
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message || 'Upload failed'
                });
            }

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No files uploaded'
                });
            }

            try {
                const uploadedFiles = [];
                for (const file of req.files) {
                    const result = await uploadToCloudinary(file.path, 'documents');
                    uploadedFiles.push({
                        filename: result.filename,
                        url: result.url,
                        public_id: result.public_id,
                        originalName: file.originalname,
                        size: file.size,
                        mimetype: file.mimetype
                    });
                }

                res.status(200).json({
                    success: true,
                    message: `${req.files.length} documents uploaded`,
                    data: { 
                        files: uploadedFiles, 
                        count: req.files.length 
                    }
                });
            } catch (uploadError) {
                // Delete local files if Cloudinary fails
                req.files.forEach(file => {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                });
                throw uploadError;
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Upload failed'
        });
    }
};

// Delete file from Cloudinary
exports.deleteFile = async (req, res) => {
    try {
        const { public_id } = req.body;
        
        if (!public_id) {
            return res.status(400).json({
                success: false,
                message: 'public_id is required'
            });
        }

        await deleteFromCloudinary(public_id);

        res.status(200).json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Delete failed'
        });
    }
};