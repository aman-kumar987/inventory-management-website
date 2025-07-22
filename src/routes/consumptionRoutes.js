const express = require('express');
const router = express.Router();
const consumptionController = require('../controllers/consumptionController');
const { hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

const canAddConsumption = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER, ROLES.USER]);
const canEditConsumption = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER, ROLES.USER]);
const canExport = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER]);

// Public view for all authenticated users
router.get('/', consumptionController.listConsumptions);

// Adding consumption
router.get('/new', canAddConsumption, consumptionController.renderNewForm);
router.post('/', canAddConsumption, consumptionController.createConsumption);

// THE FIX: Added 'canEditConsumption' to the GET route
router.get('/:id/edit', canEditConsumption, consumptionController.renderEditForm);
router.post('/:id/edit', canEditConsumption, consumptionController.updateConsumption);
router.post('/:id/delete', canEditConsumption, consumptionController.softDeleteConsumption);

// Other routes
router.get('/export', canExport, consumptionController.exportConsumptions);
router.get('/details', consumptionController.showConsumptionDetails);

module.exports = router;