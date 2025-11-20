const express = require('express');
const {
  getCustomers,
  getallCustomers,
  getCustomer,
  createCustomerByAdmin,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
  getMyProfile,
  updateMyProfile,
  getMyServiceHistory,
   uploadPropertyImages,
    uploadPropertyPhotos,
   deletePropertyImage
} = require('../controllers/customer.controller');

const Customer = require('../models/customer.model');

const router = express.Router();

const { protect, authorize } = require('../middlewares/auth');
const advancedResults = require('../middlewares/advancedResults');

// Routes for current customer (customer role)
router.get('/me', protect, 
  authorize('customer'), 
  getMyProfile);
router.put('/me', protect, authorize('customer'), updateMyProfile);
router.get('/me/history', protect, authorize('customer'), getMyServiceHistory);

// Routes requiring admin role
router.route('/')
  .get(
    protect, 
    authorize('tenantAdmin'), 
    advancedResults(Customer, {
      path: 'user',
      select: 'name email phone'
    }),
    getCustomers
  )

  .post(protect, authorize('tenantAdmin'), createCustomerByAdmin);


// ✅ SUPERADMIN ROUTE - SEPARATE ENDPOINT
router.get('/superadmin/all',
  protect, 
  authorize('superAdmin'), 
  advancedResults(Customer, {
    path: 'user',
    select: 'name email phone'
  }),
  getallCustomers  // Separate controller for superAdmin
);


//   router.post(
//   '/:id/propertyDetails/:propertyIndex/images',
//    // Make sure you have proper multer middleware
//   uploadPropertyImages
// );

// router.post(
//   '/:id/properties/:propertyName/images',
//    // Make sure you have proper multer middleware
//   uploadPropertyImages
// );
router.post(
  '/:propertyId/photos',
  // protect,
  // upload.array('photos', 10), // 'photos' field name, max 10 files
  uploadPropertyPhotos
);

// router.route('/:id/properties/:propertyName/images')
//   .post(uploadPropertyImages);

// router.delete(
//   '/:id/propertyDetails/:propertyIndex/images/:imageId',
//   deletePropertyImage
// );


// routes/customerRoutes.js
// router.delete(
//   '/:id/properties/:propertyName/images/:publicId',
//   // protect,
//   // asyncHandler(customerController.deletePropertyImage)
// );

router.delete('/:customerId/properties/:propertyName/images/:publicId(*)',deletePropertyImage);
  

router.route('/:id')
  .get(protect, authorize('tenantAdmin'), getCustomer)
  .put(protect, authorize('tenantAdmin'), updateCustomer)
  .delete(protect, authorize('tenantAdmin'), deleteCustomer);

router.get('/:id/history', protect, authorize('tenantAdmin'), getCustomerHistory);

module.exports = router; 