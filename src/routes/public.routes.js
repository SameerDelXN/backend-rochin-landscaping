const express = require('express');
const router = express.Router();

const { getPublicContactInfo } = require('../controllers/public.controller');

// Public, tenant-aware endpoints
router.get('/contact-info', getPublicContactInfo);

module.exports = router;
 