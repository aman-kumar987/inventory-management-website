const express = require('express');
const router = express.Router();
const plantController = require('../controllers/plantController');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { validatePlant } = require('../validators/plantValidator'); // <-- IMPORT VALIDATOR

router.use(isAuthenticated);
const canManage = hasRole([ROLES.SUPER_ADMIN]);

router.get('/', plantController.listPlants);
router.post('/', validatePlant, plantController.createPlant); // <-- ADD VALIDATOR
router.post('/:id/edit', validatePlant, plantController.updatePlant); // <-- ADD VALIDATOR
router.post('/:id/delete', plantController.softDeletePlant);

module.exports = router;