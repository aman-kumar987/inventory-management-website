const express = require('express');
const router = express.Router();
const itemGroupController = require('../controllers/itemGroupController');
const { validateItemGroup } = require('../validators/itemGroupValidator');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

// Protect all routes
router.use(isAuthenticated);

// Only allow Admins and Managers to manage item groups
const canManage = hasRole([ROLES.SUPER_ADMIN]);

// Main page to list and show add/edit forms
router.get('/', canManage, itemGroupController.listItemGroups);

// Create a new group
router.post('/', canManage, validateItemGroup, itemGroupController.createItemGroup);

// Update an existing group
router.post('/:id/edit', canManage, validateItemGroup, itemGroupController.updateItemGroup);

// Soft delete a group
router.post('/:id/delete', canManage, itemGroupController.softDeleteItemGroup);

module.exports = router;