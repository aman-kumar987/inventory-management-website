const { body, validationResult } = require('express-validator');

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
        .trim()
        .notEmpty().withMessage('Group name is required.')
        .isLength({ min: 3 }).withMessage('Group name must be at least 3 characters long.'),

    handleValidationErrors
];