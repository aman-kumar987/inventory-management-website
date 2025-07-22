const express = require('express');
const router = express.Router();
const plantController = require('../controllers/plantController');
const { hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { validatePlant } = require('../validators/plantValidator');

// THE FIX: Apply middleware to all routes in this file
router.use(hasRole([ROLES.SUPER_ADMIN]));

router.get('/', plantController.listPlants);
router.post('/', validatePlant, plantController.createPlant);
router.post('/:id/edit', validatePlant, plantController.updatePlant);
router.post('/:id/delete', plantController.softDeletePlant);

module.exports = router;