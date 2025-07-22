const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { validateItem } = require('../validators/itemValidator');
const { hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

// THE FIX: Apply middleware to all routes in this file
router.use(hasRole([ROLES.SUPER_ADMIN]));

router.get('/', itemController.listItems);
router.get('/new', itemController.renderNewForm);
router.post('/', validateItem, itemController.createItem);
router.get('/:id/edit', itemController.renderEditForm);
router.post('/:id/edit', validateItem, itemController.updateItem);
router.post('/:id/delete', itemController.softDeleteItem);

module.exports = router;