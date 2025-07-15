const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

// --- THIS IS THE KEY SECURITY LINE ---
// This middleware is applied to ALL routes defined in this file below it.
// It checks for authentication first, then checks if the user's role is SUPER_ADMIN.
router.use(isAuthenticated, hasRole([ROLES.SUPER_ADMIN]));

// All these routes are now protected by the middleware above.
router.get('/', userController.listUsers);
router.post('/', userController.createUser);
router.post('/:id/edit', userController.updateUser);
router.post('/:id/delete', userController.softDeleteUser);

module.exports = router;