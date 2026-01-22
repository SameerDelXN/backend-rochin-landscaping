const express = require('express');
const {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  uploadPropertyImages,
  deletePropertyImage,
  setPropertyAsDefault,
  getPropertiesByCustomer,
  getDefaultProperty,
  updateImageCaption,
  setImageAsPrimary
} = require('../controllers/property.controller');

const Property = require('../models/property.model');

const router = express.Router();

const { protect, authorize } = require('../middlewares/auth');
const advancedResults = require('../middlewares/advancedResults');

// Routes for current customer (customer role)
router.get('/default', protect, authorize('customer'), getDefaultProperty);

// Routes for all authenticated users
router.route('/')
  .get(
    protect, 
    authorize('customer', 'tenantAdmin'), 
    advancedResults(Property, {
      path: 'customer',
      select: 'user'
    }),
    getProperties
  )
  .post(protect, authorize('customer'), createProperty);

// Routes for specific property operations
router.route('/:id')
  .get(protect, authorize('customer', 'tenantAdmin'), getProperty)
  .put(protect, authorize('customer', 'tenantAdmin'), updateProperty)
  .delete(protect, authorize('customer', 'tenantAdmin'), deleteProperty);

// Set property as default
router.put('/:id/default', protect, authorize('customer'), setPropertyAsDefault);

// Image management routes (express-fileupload handles file uploads automatically)
router.post(
  '/:id/images',
  protect,
  // authorize('customer', 'tenantAdmin'),
  uploadPropertyImages
);

router.delete(
  '/:id/images/:publicId',
  protect,
  authorize('customer', 'tenantAdmin'),
  deletePropertyImage
);

router.put(
  '/:id/images/:publicId/caption',
  protect,
  authorize('customer', 'tenantAdmin'),
  updateImageCaption
);

router.put(
  '/:id/images/:publicId/primary',
  protect,
  authorize('customer', 'tenantAdmin'),
  setImageAsPrimary
);

// Admin routes for getting properties by customer
router.get(
  '/customer/:customerId',
  protect,
  authorize('tenantAdmin'),
  getPropertiesByCustomer
);

module.exports = router;
