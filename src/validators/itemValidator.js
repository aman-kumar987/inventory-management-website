const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.session.flash = { type: 'error', message: errors.array({ onlyFirstError: true })[0].msg };
        // Redirect back to the referring page to show the error
        return res.redirect(req.headers.referer || '/items');
    }
    next();
};

exports.validateItem = [
    body('item_code')
        .trim()
        .notEmpty().withMessage('Item Code is required.')
        .isLength({ min: 3 }).withMessage('Item Code must be at least 3 characters long.'),
    
    body('uom')
        .trim()
        .notEmpty().withMessage('UOM (Unit of Measurement) is required.'),
    
    body('itemGroupId')
        .isUUID().withMessage('A valid Item Group must be selected.'),
    
    body('item_description')
        .trim()
        .optional({ nullable: true }),

    handleValidationErrors
];