const bcrypt = require('bcrypt');
const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/emailService');

exports.renderLoginPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('auth/login', { title: 'Login' });
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user || user.isDeleted || user.status !== 'ACTIVE') {
            await logActivity({ 
                action: 'LOGIN_FAIL', 
                ipAddress: req.ip, 
                details: { email, reason: 'User not found or is inactive/deleted.' } 
            });
            req.session.flash = { type: 'error', message: 'Invalid credentials or account is inactive.' };
            return res.redirect('/login');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await logActivity({ 
                userId: user.id, 
                action: 'LOGIN_FAIL', 
                ipAddress: req.ip, 
                details: { email, reason: 'Incorrect password.' } 
            });
            req.session.flash = { type: 'error', message: 'Invalid credentials.' };
            return res.redirect('/login');
        }

        // --- THE FIX IS HERE: Using a function-based transaction ---
        // This is the recommended way to handle multiple, related operations.
        // `tx` is a special instance of the Prisma client for this transaction.
        await prisma.$transaction(async (tx) => {
            // 1. Update the user's last login time
            await tx.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() }
            });

            // 2. Create the activity log entry
            await tx.activityLog.create({
                data: {
                    userId: user.id, 
                    action: 'LOGIN_SUCCESS', 
                    ipAddress: req.ip 
                }
            });
        });
        
        // After the transaction is successful, create the session
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            plantId: user.plantId,
            clusterId: user.clusterId
        };
        
        // Redirect to dashboard
        res.redirect('/dashboard');

    } catch (error) {
        next(error);
    }
};

exports.logout = async (req, res, next) => {
    const user = req.session.user;
    if (user) {
        await logActivity({ userId: user.id, action: 'LOGOUT', ipAddress: req.ip });
    }
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
            return next(err);
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
};


/**
 * @desc    Render the registration page with necessary data
 * @route   GET /register
 */
exports.renderRegisterPage = async (req, res, next) => {
    try {
        if (req.session.user) {
            return res.redirect('/dashboard');
        }
        // Fetch plants for the dropdown
        const plants = await prisma.plant.findMany({ where: { isDeleted: false } });
        res.render('auth/register', {
            title: 'Register',
            plants
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Handle new user registration
 * @route   POST /register
 */
exports.register = async (req, res, next) => {
    try {
        const { name, email, password, role, plantId } = req.body;

        const existingUser = await prisma.user.findFirst({
            where: { email: email.toLowerCase(), isDeleted: false }
        });

        if (existingUser) {
            req.session.flash = { type: 'error', message: 'An account with this email already exists.' };
            return res.redirect('/register');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // --- Business Logic for Approval ---
        let userStatus = 'ACTIVE';
        let successMessage = 'Registration successful! You can now log in.';
        let userClusterId = null;

        // Find the cluster of the selected plant to assign it if the role is not a manager
        const plant = await prisma.plant.findUnique({ where: { id: plantId } });
        if (plant) {
            userClusterId = plant.clusterId;
        }

        if (role === 'CLUSTER_MANAGER') {
            userStatus = 'PENDING_APPROVAL';
            userClusterId = null; // Cluster ID must be assigned by Super Admin
            successMessage = 'Registration successful! Your account is pending approval from a Super Admin.';
        }

        const newUser = await prisma.user.create({
            data: {
                name,
                email: email.toLowerCase(),
                password: hashedPassword,
                role,
                status: userStatus,
                plantId,
                clusterId: userClusterId
            }
        });

        await logActivity({
            action: 'USER_REGISTER',
            ipAddress: req.ip,
            details: { userId: newUser.id, email: newUser.email, role: newUser.role, status: newUser.status }
        });

        req.session.flash = { type: 'success', message: successMessage };
        res.redirect('/login');

    } catch (error) {
        next(error);
    }
};

exports.renderForgotPasswordForm = (req, res) => {
    res.render('auth/forgot-password', { title: 'Forgot Password' });
};

exports.handleForgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await prisma.user.findFirst({ where: { email: email.toLowerCase(), isDeleted: false } });

        if (user) {
            // Generate a secure token
            const resetToken = crypto.randomBytes(32).toString('hex');
            // Hash the token before storing it
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

            const tokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

            await prisma.passwordResetToken.create({
                data: {
                    userId: user.id,
                    token: hashedToken,
                    expiresAt: tokenExpiry
                }
            });

            // Send the *unhashed* token to the user's email
            await sendPasswordResetEmail(user.email, resetToken);
        }

        req.session.flash = { type: 'success', message: 'If an account with that email exists, a password reset link has been sent.' };
        res.redirect('/forgot-password');
    } catch (error) {
        next(error);
    }
};

exports.renderResetPasswordForm = async (req, res, next) => {
    const { token } = req.query;
    if (!token) {
        req.session.flash = { type: 'error', message: 'Invalid or missing password reset token.' };
        return res.redirect('/forgot-password');
    }
    res.render('auth/reset-password', { title: 'Reset Password', token });
};

exports.handleResetPassword = async (req, res, next) => {
    try {
        const { token, password, confirmPassword } = req.body;

        if (password !== confirmPassword) {
            req.session.flash = { type: 'error', message: 'Passwords do not match.' };
            return res.redirect(`/reset-password?token=${token}`);
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const passwordResetToken = await prisma.passwordResetToken.findUnique({
            where: { token: hashedToken }
        });

        if (!passwordResetToken || passwordResetToken.expiresAt < new Date()) {
            req.session.flash = { type: 'error', message: 'Password reset token is invalid or has expired.' };
            return res.redirect('/forgot-password');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Use a transaction to update user and delete the token
        await prisma.$transaction([
            prisma.user.update({
                where: { id: passwordResetToken.userId },
                data: { password: hashedPassword }
            }),
            prisma.passwordResetToken.delete({
                where: { id: passwordResetToken.id }
            })
        ]);

        await logActivity({ userId: passwordResetToken.userId, action: 'PASSWORD_RESET_SUCCESS', ipAddress: req.ip });
        req.session.flash = { type: 'success', message: 'Your password has been reset successfully. You can now log in.' };
        res.redirect('/login');

    } catch (error) {
        next(error);
    }
};