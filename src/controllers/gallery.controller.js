const Gallery = require('../models/gallery.model');
const cloudinary = require('../utils/cloudinary');
const asyncHandler = require('../middlewares/async');
const ErrorResponse = require('../utils/errorResponse');
const tenantContext = require('../utils/tenantContext');

// @desc    Create new gallery entry
// @route   POST /api/v1/gallery
// @access  Private/Admin
exports.createGallery = asyncHandler(async (req, res, next) => {
  // Validate required fields
  const { title, description, location, category, projectDate } = req.body;
  
  if (!title || !description || !location || !category || !projectDate) {
    return next(new ErrorResponse('Missing required fields', 400));
  }

  // Handle image uploads
  const images = [];
  
  if (req.files && req.files.images) {
    const files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
    
    try {
      for (const file of files) {
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: 'gallery',
          resource_type: 'auto'
        });
        
        images.push({
          url: result.secure_url,
          publicId: result.public_id,
          caption: req.body.captions ? req.body.captions[files.indexOf(file)] : ''
        });
      }
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      return next(new ErrorResponse('Error uploading images to Cloudinary', 500));
    }
  }

  try {
    const galleryData = {
      title,
      description,
      location,
      category,
      projectDate,
      images,
      thumbnailIndex: req.body.thumbnailIndex ? parseInt(req.body.thumbnailIndex) : 0,
      tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : [],
      clientName: req.body.clientName || '',
      projectDuration: req.body.projectDuration || '',
      status: req.body.status || 'draft',
      createdBy: req.user.id // Track who created the gallery
    };

    // Get tenant from context
    const store = tenantContext.getStore();
    const tenantId = store?.tenantId || req.user?.tenantId;
    if (tenantId) {
      galleryData.tenant = tenantId;
    } else {
      return next(new ErrorResponse('Tenant information is missing', 400));
    }

    const gallery = await Gallery.create(galleryData);

    res.status(201).json({
      success: true,
      data: gallery
    });
  } catch (dbError) {
    console.error('Database error:', dbError);
    return next(new ErrorResponse('Error creating gallery in database', 500));
  }
});

// @desc    Get all gallery entries for current tenant admin
// @route   GET /api/v1/gallery
// @access  Private/TenantAdmin
exports.getGalleries = asyncHandler(async (req, res, next) => {
  const store = tenantContext.getStore();
  const tenantId = store?.tenantId;
  const showAllTenants = (req.headers['x-all-tenants'] === 'true');
  
  let filter = {};
  if (tenantId) {
    filter.tenant = tenantId;
  } else {
    // No tenant context
    // If explicitly requested from main domain to aggregate across all tenants,
    // return ALL galleries across all tenants (no status filter)
    if (showAllTenants) {
      // no additional filter
    } else {
      // Otherwise, only superAdmin can see all
      if (req.user?.role !== 'superAdmin') {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
    }
  }

  const galleries = await Gallery.find(filter).sort('-createdAt');
  res.status(200).json({
    success: true,
    count: galleries.length,
    data: galleries.map(gallery => ({
      ...gallery.toObject(),
      thumbnailIndex: gallery.thumbnailIndex || 0
    }))
  });
});

// @desc    Get single gallery entry (with tenant check)
// @route   GET /api/v1/gallery/:id
// @access  Public
exports.getGallery = asyncHandler(async (req, res, next) => {
  const gallery = await Gallery.findById(req.params.id);

  if (!gallery) {
    return next(new ErrorResponse(`Gallery not found with id of ${req.params.id}`, 404));
  }

  // Check if user has access to this gallery (if they're authenticated)
  if (req.user && req.user.tenant && !gallery.belongsToTenant(req.user.tenant)) {
    return next(new ErrorResponse(`Not authorized to access this gallery`, 403));
  }

  res.status(200).json({
    success: true,
    data: gallery
  });
});

// @desc    Update gallery entry (with tenant check)
// @route   PUT /api/v1/gallery/:id
// @access  Private/Admin
exports.updateGallery = asyncHandler(async (req, res, next) => {
  let gallery = await Gallery.findById(req.params.id);

  if (!gallery) {
    return next(new ErrorResponse(`Gallery not found with id of ${req.params.id}`, 404));
  }

  // Check if user has access to this gallery
  if (req.user.tenant && !gallery.belongsToTenant(req.user.tenant)) {
    return next(new ErrorResponse(`Not authorized to update this gallery`, 403));
  }

  // Handle thumbnail index update
  if (req.body.thumbnailIndex !== undefined) {
    gallery.thumbnailIndex = parseInt(req.body.thumbnailIndex);
  }

  // Handle new image uploads
  if (req.files && req.files.images) {
    const files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
    
    for (const file of files) {
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: 'gallery',
        resource_type: 'auto'
      });
      
      gallery.images.push({
        url: result.secure_url,
        publicId: result.public_id,
        caption: req.body.captions ? req.body.captions[files.indexOf(file)] : ''
      });
    }
  }

  // Update other fields
  const updateFields = ['title', 'description', 'location', 'category', 'projectDate', 'status', 'clientName', 'projectDuration', 'thumbnailIndex'];
  updateFields.forEach(field => {
    if (req.body[field]) {
      gallery[field] = req.body[field];
    }
  });

  if (req.body.tags) {
    gallery.tags = req.body.tags.split(',').map(tag => tag.trim());
  }

  await gallery.save();

  res.status(200).json({
    success: true,
    data: {
      ...gallery.toObject(),
      thumbnailIndex: gallery.thumbnailIndex
    }
  });
});

// @desc    Delete gallery entry (with tenant check)
// @route   DELETE /api/v1/gallery/:id
// @access  Private/Admin
exports.deleteGallery = asyncHandler(async (req, res, next) => {
  try {
    const gallery = await Gallery.findById(req.params.id);

    if (!gallery) {
      return next(new ErrorResponse(`Gallery not found with id of ${req.params.id}`, 404));
    }

    // Tenant check
    if (req.user.tenant && !gallery.belongsToTenant(req.user.tenant)) {
      return next(new ErrorResponse(`Not authorized to delete this gallery`, 403));
    }

    // Delete images from cloudinary
    const deletePromises = gallery.images.map(image => 
      cloudinary.uploader.destroy(image.publicId)
    );
    await Promise.all(deletePromises);

    // Delete gallery document
    await Gallery.deleteOne({ _id: gallery._id });

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    // Handle Cloudinary errors or DB errors
    console.error('Error deleting gallery:', err);
    return next(new ErrorResponse('Failed to delete gallery', 500));
  }
});

// @desc    Delete image from gallery (with tenant check)
// @route   DELETE /api/v1/gallery/:galleryId/images/:imageId
// @access  Private/Admin
exports.deleteImage = asyncHandler(async (req, res, next) => {
  const { galleryId, imageId } = req.params;

  if (!galleryId || !imageId) {
    return next(new ErrorResponse('Gallery ID and Image ID are required', 400));
  }

  // Find the gallery
  const gallery = await Gallery.findById(galleryId);
  if (!gallery) {
    return next(new ErrorResponse(`Gallery not found with id of ${galleryId}`, 404));
  }

  // Check if user has access to this gallery
  if (req.user.tenant && !gallery.belongsToTenant(req.user.tenant)) {
    return next(new ErrorResponse(`Not authorized to modify this gallery`, 403));
  }

  // Find the image in the gallery
  const imageIndex = gallery.images.findIndex(img => img._id && img._id.toString() === imageId);
  if (imageIndex === -1) {
    return next(new ErrorResponse(`Image not found with id of ${imageId}`, 404));
  }

  const image = gallery.images[imageIndex];

  try {
    // Delete from Cloudinary if publicId exists
    if (image.publicId) {
      await cloudinary.uploader.destroy(image.publicId);
    }

    // Remove image from gallery's images array
    gallery.images.splice(imageIndex, 1);
    await gallery.save();

    res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      data: gallery
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    return next(new ErrorResponse('Error deleting image', 500));
  }
});