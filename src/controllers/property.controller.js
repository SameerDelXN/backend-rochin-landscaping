const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middlewares/async');
const Property = require('../models/property.model');
const Customer = require('../models/customer.model');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const crypto = require('crypto');
const tenantContext = require('../utils/tenantContext');
const mongoose = require('mongoose');

// @desc    Get all properties (for current customer or admin)
// @route   GET /api/v1/properties
// @access  Private
exports.getProperties = asyncHandler(async (req, res, next) => {
  let filter = {};
  
  // If customer, only show their properties
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer) {
      return next(new ErrorResponse('Customer profile not found', 404));
    }
    filter.customer = customer._id;
  }
  
  // If tenant admin, show properties for their tenant
  if (req.user.role === 'tenantAdmin') {
    filter.tenants = req.user.tenantId;
  }

  const properties = await Property.find(filter)
    .populate('customer', 'user')
    .populate('user', 'name email phone')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: properties.length,
    data: properties
  });
});

// @desc    Get single property
// @route   GET /api/v1/properties/:id
// @access  Private
exports.getProperty = asyncHandler(async (req, res, next) => {
  const property = await Property.findById(req.params.id)
    .populate('customer', 'user')
    .populate('user', 'name email phone');

  if (!property) {
    return next(
      new ErrorResponse(`Property not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access to this property
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer || property.customer.toString() !== customer._id.toString()) {
      return next(new ErrorResponse('Not authorized to access this property', 401));
    }
  }

  res.status(200).json({
    success: true,
    data: property
  });
});

// @desc    Create new property
// @route   POST /api/v1/properties
// @access  Private
exports.createProperty = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.user = req.user.id;

  // Get customer for current user
  const customer = await Customer.findOne({ user: req.user.id });
  if (!customer) {
    return next(new ErrorResponse('Customer profile not found', 404));
  }

  // Add customer to req.body
  req.body.customer = customer._id;

  // Get tenant from context or user's tenantId
  const store = tenantContext.getStore();
  let tenantId = store?.tenantId;
  
  // If no tenant context, try to get from user's tenantId
  if (!tenantId && req.user.tenantId) {
    tenantId = req.user.tenantId;
  }
  
  // If still no tenant, try to get from customer's tenants
  if (!tenantId && customer.tenants && customer.tenants.length > 0) {
    tenantId = customer.tenants[0];
  }
  
  if (!tenantId) {
    return next(new ErrorResponse('Tenant context is required to create a property. Please ensure you are accessing the API through a valid tenant subdomain or include the X-Tenant-Subdomain header.', 400));
  }
  
  // Add tenant to req.body (plugin will handle tenant field automatically)
  req.body.tenants = [tenantId];
  req.body.tenant = tenantId; // Also set the tenant field for the plugin

  // Generate full address if address components are provided
  if (req.body.address && req.body.address.street && req.body.address.city && req.body.address.state && req.body.address.zipCode) {
    req.body.address.fullAddress = `${req.body.address.street}, ${req.body.address.city}, ${req.body.address.state} ${req.body.address.zipCode}, ${req.body.address.country || 'USA'}`;
  }

  // If this is the first property, set it as default
  const existingProperties = await Property.find({ customer: customer._id });
  if (existingProperties.length === 0) {
    req.body.isDefault = true;
  }

  const property = await Property.create(req.body);

  // Populate customer and user details
  await property.populate([
    { path: 'customer', select: 'name email phone' },
    { path: 'user', select: 'name email' },
    { path: 'tenants', select: 'name' }
  ]);

  res.status(201).json({
    success: true,
    data: property
  });
});

// @desc    Update property
// @route   PUT /api/v1/properties/:id
// @access  Private
exports.updateProperty = asyncHandler(async (req, res, next) => {
  let property = await Property.findById(req.params.id);

  if (!property) {
    return next(
      new ErrorResponse(`Property not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access to this property
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer || property.customer.toString() !== customer._id.toString()) {
      return next(new ErrorResponse('Not authorized to update this property', 401));
    }
  }

  // Tenant will be handled automatically by the plugin

  // Generate full address if address components are being updated
  if (req.body.address && (req.body.address.street || req.body.address.city || req.body.address.state || req.body.address.zipCode)) {
    const address = {
      street: req.body.address.street || property.address.street,
      city: req.body.address.city || property.address.city,
      state: req.body.address.state || property.address.state,
      zipCode: req.body.address.zipCode || property.address.zipCode,
      country: req.body.address.country || property.address.country || 'USA'
    };
    req.body.address.fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zipCode}, ${address.country}`;
  }

  property = await Property.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  // Populate customer and user details
  await property.populate([
    { path: 'customer', select: 'name email phone' },
    { path: 'user', select: 'name email' },
    { path: 'tenants', select: 'name' }
  ]);

  res.status(200).json({
    success: true,
    data: property
  });
});

// @desc    Delete property
// @route   DELETE /api/v1/properties/:id
// @access  Private
exports.deleteProperty = asyncHandler(async (req, res, next) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return next(
      new ErrorResponse(`Property not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access to this property
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer || property.customer.toString() !== customer._id.toString()) {
      return next(new ErrorResponse('Not authorized to delete this property', 401));
    }
  }

  // Delete all images from cloudinary
  if (property.images && property.images.length > 0) {
    for (const image of property.images) {
      try {
        await cloudinary.uploader.destroy(image.publicId);
      } catch (error) {
        console.error('Error deleting image from cloudinary:', error);
      }
    }
  }

  await property.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Upload property images
// @route   POST /api/v1/properties/:id/images
// @access  Private
exports.uploadPropertyImages = asyncHandler(async (req, res, next) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return next(
      new ErrorResponse(`Property not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access to this property
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer || property.customer.toString() !== customer._id.toString()) {
      return next(new ErrorResponse('Not authorized to upload images for this property', 401));
    }
  }

  if (!req.files || Object.keys(req.files).length === 0) {
    return next(new ErrorResponse('Please upload at least one image', 400));
  }

  const uploadedImages = [];
  const files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];

  for (const file of files) {
    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      return next(new ErrorResponse('Please upload only image files', 400));
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return next(new ErrorResponse('Image size should be less than 10MB', 400));
    }

    try {
      // Upload to cloudinary
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: `properties/${property._id}`,
        transformation: [
          { width: 1200, height: 800, crop: 'fill' },
          { quality: 'auto' }
        ]
      });

      const imageData = {
        url: result.secure_url,
        publicId: result.public_id,
        caption: req.body.caption || '',
        isPrimary: property.images.length === 0, // First image becomes primary
        uploadedAt: new Date()
      };

      uploadedImages.push(imageData);
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      return next(new ErrorResponse('Error uploading image to cloudinary', 500));
    }
  }

  // Add images to property
  property.images.push(...uploadedImages);
  await property.save();

  res.status(200).json({
    success: true,
    data: uploadedImages
  });
});

// @desc    Delete property image
// @route   DELETE /api/v1/properties/:id/images/:publicId
// @access  Private
exports.deletePropertyImage = asyncHandler(async (req, res, next) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return next(
      new ErrorResponse(`Property not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access to this property
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer || property.customer.toString() !== customer._id.toString()) {
      return next(new ErrorResponse('Not authorized to delete images for this property', 401));
    }
  }

  const imageIndex = property.images.findIndex(
    img => img.publicId === req.params.publicId
  );

  if (imageIndex === -1) {
    return next(
      new ErrorResponse(`Image not found with public id of ${req.params.publicId}`, 404)
    );
  }

  const imageToDelete = property.images[imageIndex];

  try {
    // Delete from cloudinary
    await cloudinary.uploader.destroy(req.params.publicId);
    
    // Remove from property
    property.images.splice(imageIndex, 1);
    
    // If this was the primary image and there are other images, set the first one as primary
    if (imageToDelete.isPrimary && property.images.length > 0) {
      property.images[0].isPrimary = true;
    }
    
    await property.save();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    return next(new ErrorResponse('Error deleting image', 500));
  }
});

// @desc    Set property as default
// @route   PUT /api/v1/properties/:id/set-default
// @access  Private
exports.setPropertyAsDefault = asyncHandler(async (req, res, next) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return next(
      new ErrorResponse(`Property not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access to this property
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer || property.customer.toString() !== customer._id.toString()) {
      return next(new ErrorResponse('Not authorized to modify this property', 401));
    }
  }

  await property.setAsDefault();

  res.status(200).json({
    success: true,
    data: property
  });
});

// @desc    Get properties by customer (for admin)
// @route   GET /api/v1/properties/customer/:customerId
// @access  Private/Admin
exports.getPropertiesByCustomer = asyncHandler(async (req, res, next) => {
  const properties = await Property.find({ customer: req.params.customerId })
    .populate('customer', 'user')
    .populate('user', 'name email phone')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: properties.length,
    data: properties
  });
});

// @desc    Get default property for current customer
// @route   GET /api/v1/properties/default
// @access  Private/Customer
exports.getDefaultProperty = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findOne({ user: req.user.id });
  if (!customer) {
    return next(new ErrorResponse('Customer profile not found', 404));
  }

  const property = await Property.findDefaultByCustomer(customer._id)
    .populate('customer', 'user')
    .populate('user', 'name email phone');

  if (!property) {
    return next(new ErrorResponse('No default property found', 404));
  }

  res.status(200).json({
    success: true,
    data: property
  });
});

// @desc    Update image caption
// @route   PUT /api/v1/properties/:id/images/:publicId/caption
// @access  Private
exports.updateImageCaption = asyncHandler(async (req, res, next) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return next(
      new ErrorResponse(`Property not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access to this property
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer || property.customer.toString() !== customer._id.toString()) {
      return next(new ErrorResponse('Not authorized to modify this property', 401));
    }
  }

  const image = property.images.find(img => img.publicId === req.params.publicId);
  if (!image) {
    return next(
      new ErrorResponse(`Image not found with public id of ${req.params.publicId}`, 404)
    );
  }

  image.caption = req.body.caption || '';
  await property.save();

  res.status(200).json({
    success: true,
    data: image
  });
});

// @desc    Set image as primary
// @route   PUT /api/v1/properties/:id/images/:publicId/set-primary
// @access  Private
exports.setImageAsPrimary = asyncHandler(async (req, res, next) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return next(
      new ErrorResponse(`Property not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access to this property
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer || property.customer.toString() !== customer._id.toString()) {
      return next(new ErrorResponse('Not authorized to modify this property', 401));
    }
  }

  // Remove primary from all images
  property.images.forEach(img => {
    img.isPrimary = false;
  });

  // Set the specified image as primary
  const image = property.images.find(img => img.publicId === req.params.publicId);
  if (!image) {
    return next(
      new ErrorResponse(`Image not found with public id of ${req.params.publicId}`, 404)
    );
  }

  image.isPrimary = true;
  await property.save();

  res.status(200).json({
    success: true,
    data: property.images
  });
});
