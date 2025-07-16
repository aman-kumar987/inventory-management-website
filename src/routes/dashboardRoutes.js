const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isAuthenticated } = require('../middleware/auth');

// Protect all dashboard routes
router.use(isAuthenticated);

router.get('/', dashboardController.showDashboard);

module.exports = router;