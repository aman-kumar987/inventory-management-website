const express = require('express');
const router = express.Router();
const consumptionController = require('../controllers/consumptionController');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

const canView = isAuthenticated;
const canAdd = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER, ROLES.USER]);
const canExport = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER]);

router.use(isAuthenticated);
// Route to view consumption history
router.get('/', consumptionController.listConsumptions);

// Routes for Adding Consumption (Admins, Managers, and Users can add)
const canAddConsumption = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER, ROLES.USER]);
router.get('/new', canAddConsumption, consumptionController.renderNewForm);
router.post('/', canAddConsumption, consumptionController.createConsumption);
// ... existing routes ...

// Routes for viewing and editing a single consumption record
const canEditConsumption = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER]);
router.get('/:id/edit', isAuthenticated, consumptionController.renderEditForm);
router.post('/:id/edit', isAuthenticated, canEditConsumption, consumptionController.updateConsumption);
router.post('/:id/delete', canEditConsumption, consumptionController.softDeleteConsumption); // For a future delete button

router.get('/export', canExport, consumptionController.exportConsumptions);
router.get('/details', consumptionController.showConsumptionDetails);
module.exports = router;