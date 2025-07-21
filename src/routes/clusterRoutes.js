const express = require('express');
const router = express.Router();
const clusterController = require('../controllers/clusterController');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { validateCluster } = require('../validators/clusterValidator'); // <-- IMPORT VALIDATOR

const canManage = hasRole([ROLES.SUPER_ADMIN]);

router.get('/', clusterController.listClusters);
router.post('/', validateCluster, clusterController.createCluster); // <-- ADD VALIDATOR
router.post('/:id/edit', validateCluster, clusterController.updateCluster); // <-- ADD VALIDATOR
router.post('/:id/delete', clusterController.softDeleteCluster);

module.exports = router;