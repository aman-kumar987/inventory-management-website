const { body, validationResult } = require('express-validator');
const { sanitize } = require('../utils/sanitizer'); // Import sanitizer

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.session.flash = { type: 'error', message: errors.array({ onlyFirstError: true })[0].msg };
        return res.redirect(req.headers.referer || '/items');
    }
    next();
};

exports.validateItem = [
    body('item_code')
        .customSanitizer(value => sanitize(value)) // CHANGE: Sanitize first
        .trim()
        .notEmpty().withMessage('Item Code is required.')
        .isLength({ min: 3 }).withMessage('Item Code must be at least 3 characters long.'),
    
    body('uom')
        .customSanitizer(value => sanitize(value)) // CHANGE: Sanitize first
        .trim()
        .notEmpty().withMessage('UOM (Unit of Measurement) is required.'),
    
    body('itemGroupId')
        .isUUID().withMessage('A valid Item Group must be selected.'),
    
    body('item_description')
        .customSanitizer(value => sanitize(value)) // CHANGE: Sanitize optional field too
        .trim()
        .optional({ nullable: true }),

    handleValidationErrors
];