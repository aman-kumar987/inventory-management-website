const express = require('express');
const router = express.Router();
const clusterController = require('../controllers/clusterController');
const { hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { validateCluster } = require('../validators/clusterValidator');

// THE FIX: Apply middleware to all routes in this file
router.use(hasRole([ROLES.SUPER_ADMIN]));

router.get('/', clusterController.listClusters);
router.post('/', validateCluster, clusterController.createCluster);
router.post('/:id/edit', validateCluster, clusterController.updateCluster);
router.post('/:id/delete', clusterController.softDeleteCluster);

module.exports = router;