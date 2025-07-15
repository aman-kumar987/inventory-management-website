const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.session.flash = { type: 'error', message: errors.array()[0].msg };
        // Redirect back to the page they came from, which is cleaner than re-rendering
        return res.redirect(req.headers.referer || '/plants');
    }
    next();
};

exports.validatePlant = [
    body('name')
        .trim()
        .notEmpty().withMessage('Plant name is required.')
        .isLength({ min: 3 }).withMessage('Plant name must be at least 3 characters long.'),
    
    body('clusterId')
        .isUUID().withMessage('A valid cluster must be selected.'),
    
    handleValidationErrors
];