const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

// This middleware will apply to all routes in this file
const canApprove = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER]);

// --- Scrap Approvals ---
router.get('/scrap', canApprove, approvalController.listScrapApprovals);
router.post('/scrap/:id/process', canApprove, approvalController.processScrapRequest);
router.post('/consumption-scrap/:id/process', canApprove, approvalController.processConsumptionScrapRequest);
// --- NEW User Approvals (Only Super Admins can approve users) ---
const canApproveUsers = hasRole([ROLES.SUPER_ADMIN]);
router.get('/users', canApproveUsers, approvalController.listUserApprovals);
router.post('/users/:id/process', canApproveUsers, approvalController.processUserRequest);


module.exports = router;