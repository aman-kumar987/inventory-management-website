// src/routes/userRoutes.js

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { hasRole } = require('../middleware/auth'); // isAuthenticated ab app.js mein hai
const { ROLES } = require('../utils/constants');

// Poori file par Super Admin ka check lagega
router.use(hasRole([ROLES.SUPER_ADMIN]));

// NAYE ROUTES
router.get('/', userController.listUsers);
router.get('/new', userController.renderAddForm); // Naya user banane ka form
router.post('/new', userController.createUser);   // Form submit karne par
router.get('/:id/edit', userController.renderEditForm); // User edit karne ka form
router.post('/:id/edit', userController.updateUser);
router.post('/:id/delete', userController.softDeleteUser);

module.exports = router;