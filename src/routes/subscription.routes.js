const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const { createCheckoutSession, createPortalSession, createUpiInitCheckoutSession, getPlans, verifyCheckout } = require('../controllers/subscription.controller');

// Public verification endpoint (uses session_id validated against Stripe)
router.get('/verify', verifyCheckout);

// Protected tenant-admin endpoints
router.use(protect);
// Allow any authenticated tenant user to view available plans
router.get('/plans', getPlans);
router.use(authorize('tenantAdmin'));

router.post('/checkout-session', createCheckoutSession);
router.post('/portal-session', createPortalSession);
router.post('/qr-upi-checkout-session', createUpiInitCheckoutSession);

module.exports = router;
