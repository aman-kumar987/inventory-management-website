const { body, validationResult } = require('express-validator');
const { sanitize } = require('../utils/sanitizer'); // Import sanitizer

exports.validateLogin = [
    body('email')
        .isEmail().withMessage('Please enter a valid email address.')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required.'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.flash = { type: 'error', message: errors.array()[0].msg };
            return res.redirect('/login');
        }
        next();
    }
];

exports.validateRegister = [
    body('name')
        .customSanitizer(value => sanitize(value))
        .trim()
        .notEmpty().withMessage('Name is required.'),

    body('email').isEmail().withMessage('Please provide a valid email.').normalizeEmail(),
    
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),
    
    // Naya: Confirm Password ko check karein
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match.');
        }
        return true;
    }),

    // Role aur PlantId ka validation hata diya gaya hai
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.flash = { type: 'error', message: errors.array()[0].msg };
            return res.redirect('/register');
        }
        next();
    }
];