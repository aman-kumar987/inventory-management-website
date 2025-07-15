const { body, validationResult } = require('express-validator');

exports.validateLogin = [
    // Validate email
    body('email')
        .isEmail().withMessage('Please enter a valid email address.')
        .normalizeEmail(), // Sanitizes the email (e.g., converts to lowercase)

    // Validate password
    body('password')
        .notEmpty().withMessage('Password is required.'),

    // Middleware to handle validation results
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.flash = { type: 'error', message: errors.array()[0].msg };
            return res.redirect('/login');
        }
        next();
    }
];

// ... keep your existing validateLogin export ...

exports.validateRegister = [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('email').isEmail().withMessage('Please provide a valid email.').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),
    body('role').isIn(['USER', 'VIEWER', 'CLUSTER_MANAGER']).withMessage('Invalid role selected.'),
    body('plantId').isUUID().withMessage('A valid plant must be selected.'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.flash = { type: 'error', message: errors.array()[0].msg };
            return res.redirect('/register');
        }
        next();
    }
];