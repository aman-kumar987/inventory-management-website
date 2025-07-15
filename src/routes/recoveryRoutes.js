const express = require('express');
const router = express.Router();
const recoveryController = require('../controllers/recoveryController');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

// Protect all recovery routes - ONLY Super Admin can access
router.use(isAuthenticated, hasRole([ROLES.SUPER_ADMIN]));

router.get('/', recoveryController.renderRecoveryPage);
router.post('/undo', recoveryController.undoSoftDelete);

module.exports = router;