const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

router.use(isAuthenticated);

// This middleware will apply to all routes in this file
const canApprove = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER]);

// --- Scrap Approvals ---
router.get('/scrap', canApprove, approvalController.listScrapApprovals);
router.post('/scrap/:id/process', canApprove, approvalController.processScrapRequest);

// --- NEW User Approvals (Only Super Admins can approve users) ---
const canApproveUsers = hasRole([ROLES.SUPER_ADMIN]);
router.get('/users', canApproveUsers, approvalController.listUserApprovals);
router.post('/users/:id/process', canApproveUsers, approvalController.processUserRequest);


module.exports = router;