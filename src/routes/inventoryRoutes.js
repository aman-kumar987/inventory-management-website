const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const upload = require('../middleware/upload');
const csrf = require('csurf');

const csrfProtection = csrf(); // local use

router.use(isAuthenticated);

const canImport = hasRole([ROLES.SUPER_ADMIN]);
const canManage = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER]);
const canAdd = hasRole([ROLES.SUPER_ADMIN, ROLES.CLUSTER_MANAGER, ROLES.USER]);

router.post(
  '/import',
  canImport,
  upload.single('importFile'), // Multer FIRST
  csrfProtection,              // CSRF AFTER
  inventoryController.syncAndAddInventory
);

// Remaining routes (CSRF already handled in app.js)
router.get('/', inventoryController.showSummaryView);
router.get('/summary', inventoryController.showSummaryView);
router.get('/ledger', inventoryController.showLedgerView);
router.get('/ledger/export', canManage, inventoryController.exportLedger);
router.get('/summary/export', canManage, inventoryController.exportSummary);

router.get('/new', canAdd, inventoryController.renderNewForm);
router.post('/', canAdd, inventoryController.createInventory);
router.get('/:id/edit', canAdd, inventoryController.renderEditForm);
router.post('/:id/edit', canAdd, inventoryController.updateInventory);
router.post('/:id/delete', canAdd, inventoryController.softDeleteInventory);

module.exports = router;
