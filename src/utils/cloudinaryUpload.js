const cloudinary = require('../config/cloudinary');
const fs = require('fs');

const uploadToCloudinary = async (filePath, folder = 'profiles') => {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: `doctor_appointment/${folder}`,
            resource_type: 'auto'
        });

        // Delete local file after upload
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        return {
            url: result.secure_url,
            public_id: result.public_id,
            filename: result.original_filename
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
};

const deleteFromCloudinary = async (publicId) => {
    try {
        await cloudinary.uploader.destroy(publicId);
        return true;
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        throw error;
    }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };