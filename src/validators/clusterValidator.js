const { body, validationResult } = require('express-validator');
const { sanitize } = require('../utils/sanitizer'); // Import sanitizer

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.session.flash = { type: 'error', message: errors.array()[0].msg };
        return res.redirect(req.headers.referer || '/clusters');
    }
    next();
};

exports.validateCluster = [
    body('name')
        .customSanitizer(value => sanitize(value)) // CHANGE: Sanitize first
        .trim()
        .notEmpty().withMessage('Cluster name is required.')
        .isLength({ min: 3 }).withMessage('Cluster name must be at least 3 characters long.'),

    handleValidationErrors
];