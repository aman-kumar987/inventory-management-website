const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

// Protect all log routes for Super Admins only
router.use(isAuthenticated, hasRole([ROLES.SUPER_ADMIN]));

router.get('/', logController.listLogs);

module.exports = router;