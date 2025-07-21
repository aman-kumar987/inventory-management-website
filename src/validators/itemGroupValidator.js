const { body, validationResult } = require('express-validator');
const { sanitize } = require('../utils/sanitizer');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.session.flash = { type: 'error', message: errors.array({ onlyFirstError: true })[0].msg };
        return res.redirect(req.headers.referer || '/item-groups');
    }
    next();
};

exports.validateItemGroup = [
    body('name')
        .customSanitizer(value => sanitize(value)) // Sanitize first
        .trim()
        .notEmpty().withMessage('Item group name cannot be empty.')
        .isLength({ min: 3 }).withMessage('Item group name must be at least 3 characters long.'),
    
    handleValidationErrors // Added for consistency
];