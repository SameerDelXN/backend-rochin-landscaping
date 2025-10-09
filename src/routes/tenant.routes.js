const express = require('express');
const { getTenantInfo , updateTenant, getMyTenant } = require('../controllers/tenant.controller');
const { optional } = require('../middlewares/auth');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

// Public route to get tenant information
router.get('/info', optional, getTenantInfo);
router.put('/:id', protect, authorize('tenantAdmin'), updateTenant);
router.get('/me', protect, authorize('tenantAdmin'), getMyTenant);

module.exports = router;