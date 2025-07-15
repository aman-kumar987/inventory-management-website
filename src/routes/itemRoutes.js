const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { validateItem } = require('../validators/itemValidator');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants'); // We'll create this file

// Protect all item routes
router.use(isAuthenticated);

// List items (all roles can view)
router.get('/', itemController.listItems);

// Routes for Admin & Manager only
const canManage = hasRole([ROLES.SUPER_ADMIN]); 
// Create
router.get('/new', canManage, itemController.renderNewForm);
router.post('/', canManage, validateItem, itemController.createItem);

// Update
router.get('/:id/edit', canManage, itemController.renderEditForm);
router.post('/:id/edit', canManage, validateItem, itemController.updateItem);

// Delete
router.post('/:id/delete', isAuthenticated, canManage, itemController.softDeleteItem);

module.exports = router;