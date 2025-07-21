const express = require('express');
const router = express.Router();
const clusterUserController = require('../controllers/clusterUserController'); // New controller
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

// Protect these routes for Cluster Managers only
router.use(hasRole([ROLES.CLUSTER_MANAGER]));

router.get('/', clusterUserController.listUsers);
router.post('/', clusterUserController.createUser);
router.post('/:id/edit', clusterUserController.updateUser);
router.post('/:id/delete', clusterUserController.softDeleteUser);

module.exports = router;