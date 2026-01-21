const express = require('express');
const router = express.Router();
const {
  createGallery,
  getGalleries,
  getGallery,
  updateGallery,
  deleteGallery,
  deleteImage,
  getUploadSignature
} = require('../controllers/gallery.controller');
const { protect, authorize } = require('../middlewares/auth');
const { createGalleryValidation, updateGalleryValidation } = require('../middlewares/validators/gallery.validator');
const validate = require('../middlewares/validators/validate');
const tenantResolver = require('../middlewares/tenantResolver');

// Public routes
router.get('/', tenantResolver.resolveTenant, getGalleries);
router.get('/:id', tenantResolver.resolveTenant, getGallery);

// Protected routes
router.use(protect);
router.use(authorize('tenantAdmin'));

// Direct upload signature
router.get('/upload-signature', getUploadSignature);

router.post('/', createGallery);
router.put('/:id', updateGallery);
router.delete('/:id', deleteGallery);
router.delete('/:galleryId/images/:imageId', deleteImage);

module.exports = router; 