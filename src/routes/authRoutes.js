const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateLogin, validateRegister } = require('../validators/authValidator');

// ✅ No need to use csurf middleware here anymore
// ✅ csrfToken is now automatically injected in `res.locals` by global middleware

// @route   GET /login
// @desc    Render login page
router.get('/login', authController.renderLoginPage);

// @route   POST /login
// @desc    Authenticate user & create session
router.post('/login', validateLogin, authController.login);

// @route   GET /logout
// @desc    Logout user and destroy session
router.get('/logout', authController.logout);

// @route   GET /register
// @desc    Render registration page
router.get('/register', authController.renderRegisterPage);

// @route   POST /register
// @desc    Handle new user registration
router.post('/register', validateRegister, authController.register);

// @route   Forgot/Reset Password Routes
router.get('/forgot-password', authController.renderForgotPasswordForm);
router.post('/forgot-password', authController.handleForgotPassword);
router.get('/reset-password', authController.renderResetPasswordForm);
router.post('/reset-password', authController.handleResetPassword);

module.exports = router;
