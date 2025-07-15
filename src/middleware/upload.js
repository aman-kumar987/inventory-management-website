const multer = require('multer');

// Configure Multer for in-memory file storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.originalname.endsWith('.xlsx')) {
        cb(null, true); // Accept file
    } else {
        // Reject file with a specific error
        cb(new Error('Invalid file type. Only .xlsx files are allowed.'), false);
    }
};

const limits = { fileSize: 50 * 1024 * 1024 }; // 5MB file size limit

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: limits
});

module.exports = upload;