const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const userController = require('../controllers/userController');
const { isAuthenticated, isApproved } = require('../middleware/auth');

router.use(isApproved)

router.get('/', dashboardController.showDashboard);
router.get('/summary', dashboardController.getGroupSummary);
router.get('/my-requests', userController.showMyRequests);

module.exports = router;