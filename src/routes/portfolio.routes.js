// const express = require('express');
// const router = express.Router();
// const {
//   createPortfolio,
//    getAllPortfolios,
//   getPortfolios,
//   getPublicPortfolios,
//   getPortfolio,
//   updatePortfolio,
//   deletePortfolio,
//   deleteImage
// } = require('../controllers/portfolio.controller');
// const { protect, authorize } = require('../middlewares/auth');
// const { createPortfolioValidation, updatePortfolioValidation } = require('../middlewares/validators/portfolio.validator');
// const validate = require('../middlewares/validators/validate');
// const tenantResolver = require('../middlewares/tenantResolver');

// // Public routes
// router.get('/public', getPublicPortfolios);
// router.get('/', tenantResolver.resolveTenant, getPortfolios);
// router.route('/all')
//   .get(getAllPortfolios);
// router.get('/:id', tenantResolver.resolveTenant, getPortfolio);

// // Protected routes (Admin only)
// router.post(
//   '/',
//   [protect, authorize('tenantAdmin'), createPortfolioValidation, validate],
//   createPortfolio
// );




// router.put(
//   '/:id',
//   [protect, authorize('admin', 'tenantAdmin'), updatePortfolioValidation, validate],
//   updatePortfolio
// );

// router.delete(
//   '/:id',
//   [protect, authorize('tenantAdmin')],
//   deletePortfolio
// );

// router.delete(
//   '/:id/images/:imageId',
//   [protect, authorize('admin', 'tenantAdmin')],
//   deleteImage
// );

// // router.get('/all', getAllPortfolios);

// module.exports = router; 






// backend-rochin-landscaping/src/routes/portfolio.routes.js
const express = require('express');
const cors = require('cors');
const router = express.Router();

const {
  createPortfolio,
  getAllPortfolios,
  getPortfolios,
  getPublicPortfolios,
  getPortfolio,
  updatePortfolio,
  deletePortfolio,
  deleteImage
} = require('../controllers/portfolio.controller');

const { protect, authorize } = require('../middlewares/auth');
const { createPortfolioValidation, updatePortfolioValidation } = require('../middlewares/validators/portfolio.validator');
const validate = require('../middlewares/validators/validate');
const tenantResolver = require('../middlewares/tenantResolver');

// CORS options tailored for multi-tenant frontends and authenticated calls
const corsOptions = {
  origin: true, // echo the request Origin (supports multiple tenant/custom domains)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Tenant-Domain',
    'X-Tenant-Subdomain',
    'x-tenant-id',
    'x-tenant-subdomain',
    'x-tenant-domain',
    'x-all-tenants'
  ],
};

// Preflight for this router
router.options('*', cors(corsOptions));

// Public routes
router.get('/public', cors(corsOptions), getPublicPortfolios);

// Tenant-scoped reads
router.get('/', cors(corsOptions), tenantResolver.resolveTenant, getPortfolios);
router.route('/all').get(cors(corsOptions), getAllPortfolios);
router.get('/:id', cors(corsOptions), tenantResolver.resolveTenant, getPortfolio);

// Protected routes (Tenant Admin or Admin)
router.post(
  '/',
  cors(corsOptions),
  protect,
  authorize('tenantAdmin'),
  tenantResolver.resolveTenant,
  createPortfolioValidation,
  validate,
  createPortfolio
);

router.put(
  '/:id',
  cors(corsOptions),
  protect,
  authorize('admin', 'tenantAdmin'),
  tenantResolver.resolveTenant,
  updatePortfolioValidation,
  validate,
  updatePortfolio
);

router.delete(
  '/:id',
  cors(corsOptions),
  protect,
  authorize('tenantAdmin'),
  tenantResolver.resolveTenant,
  deletePortfolio
);

router.delete(
  '/:id/images/:imageId',
  cors(corsOptions),
  protect,
  authorize('admin', 'tenantAdmin'),
  tenantResolver.resolveTenant,
  deleteImage
);

module.exports = router;