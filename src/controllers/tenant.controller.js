const Tenant = require('../models/tenant.model');
const asyncHandler = require('../middlewares/async');
const ErrorResponse = require('../utils/errorResponse');
const tenantContext = require('../utils/tenantContext');

// @desc    Get tenant information (public)
// @route   GET /api/v1/tenant/info
// @access  Public
exports.getTenantInfo = asyncHandler(async (req, res, next) => {
  console.log("STart")

  
  const store = tenantContext.getStore();
  console.log(store)
  if (!store?.tenantId) {
    // For superadmin domains, return null tenant info instead of error
    return res.status(200).json({
      success: true,
      data: null,
      message: 'Superadmin domain - no tenant context'
    });
  }

  const tenant = await Tenant.findById(store.tenantId).select('-owner -subscription');

  if (!tenant) {
    return next(new ErrorResponse('Tenant not found', 404));
  }

  res.status(200).json({
    success: true,
    data: tenant
  });
});

// @desc    Get my tenant (with subscription) for tenant admin
// @route   GET /api/v1/tenant/me
// @access  Private/TenantAdmin
exports.getMyTenant = asyncHandler(async (req, res, next) => {
  // Expect auth middleware to set req.user.tenantId
  const tenantId = req.user?.tenantId?._id || req.user?.tenantId;
  if (!tenantId) {
    return next(new ErrorResponse('Tenant context not found', 404));
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    return next(new ErrorResponse('Tenant not found', 404));
  }

  res.status(200).json({ success: true, data: tenant });
});

// @desc    Get all tenants
// @route   GET /api/v1/admin/tenants
// @access  Private/Superadmin
exports.getTenants = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single tenant
// @route   GET /api/v1/admin/tenants/:id
// @access  Private/Superadmin
exports.getTenant = asyncHandler(async (req, res, next) => {
  const tenant = await Tenant.findById(req.params.id);

  if (!tenant) {
    return next(new ErrorResponse(`Tenant not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: tenant });
});

// @desc    Create new tenant
// @route   POST /api/v1/admin/tenants
// @access  Private/Superadmin
exports.createTenant = asyncHandler(async (req, res, next) => {
  const { name, email, subdomain } = req.body;

  // Basic validation
  if (!name || !email || !subdomain) {
    return next(new ErrorResponse('Please provide a name, email, and subdomain', 400));
  }

  // Check for duplicate subdomain
  const existingTenant = await Tenant.findOne({ subdomain });
  if (existingTenant) {
    return next(new ErrorResponse(`Subdomain ${subdomain} is already taken`, 400));
  }

  const tenant = await Tenant.create({ name, email, subdomain });

  res.status(201).json({
    success: true,
    data: tenant,
  });
});

// // @desc    Update tenant
// // @route   PUT /api/v1/admin/tenants/:id
// // @access  Private/Superadmin
// exports.updateTenant = asyncHandler(async (req, res, next) => {
//   let tenant = await Tenant.findById(req.params.id);

//   if (!tenant) {
//     return next(new ErrorResponse(`Tenant not found with id of ${req.params.id}`, 404));
//   }

//   // Only allow updating specific fields
//   const { name, email, address, isActive, subscription } = req.body;
//   const fieldsToUpdate = { name, email, address, isActive, subscription };

//   tenant = await Tenant.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
//     new: true,
//     runValidators: true,
//   });

//   res.status(200).json({ success: true, data: tenant });
// });



// @desc    Update tenant info (for tenant admins)
// @route   PUT /api/v1/tenant/info
// @access  Private/TenantAdmin
exports.updateTenant = asyncHandler(async (req, res, next) => {
  const store = tenantContext.getStore();
  
  if (!store?.tenantId) {
    return next(new ErrorResponse('Tenant context not found', 404));
  }

  const { name, email, address, phone, website, businessHours } = req.body;
  
  const tenant = await Tenant.findByIdAndUpdate(
    store.tenantId,
    { 
      name,
      email,
      address,
      phone,
      website,
      settings: {
        businessHours
      }
    },
    { new: true, runValidators: true }
  );

  res.status(200).json({ 
    success: true, 
    data: tenant 
  });
});

// @desc    Delete tenant
// @route   DELETE /api/v1/admin/tenants/:id
// @access  Private/Superadmin
exports.deleteTenant = asyncHandler(async (req, res, next) => {
  const tenant = await Tenant.findByIdAndDelete(req.params.id);

  if (!tenant) {
    return next(new ErrorResponse(`Tenant not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: {} });
});

// @desc    Suspend/Activate tenant
// @route   PUT /api/v1/admin/tenants/:id/status
// @access  Private/Superadmin
exports.updateTenantStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  
  if (!['active', 'inactive', 'trialing'].includes(status)) {
    return next(new ErrorResponse('Invalid status. Must be active, inactive, or trialing', 400));
  }

  let tenant = await Tenant.findById(req.params.id);

  if (!tenant) {
    return next(new ErrorResponse(`Tenant not found with id of ${req.params.id}`, 404));
  }

  tenant.subscription.status = status;
  await tenant.save();

  res.status(200).json({ 
    success: true, 
    data: tenant,
    message: `Tenant status updated to ${status}`
  });
});

// @desc    Get tenant usage metrics
// @route   GET /api/v1/admin/tenants/:id/metrics
// @access  Private/Superadmin
exports.getTenantMetrics = asyncHandler(async (req, res, next) => {
  const tenant = await Tenant.findById(req.params.id);

  if (!tenant) {
    return next(new ErrorResponse(`Tenant not found with id of ${req.params.id}`, 404));
  }

  // TODO: Implement actual metrics calculation
  const metrics = {
    totalUsers: 0,
    totalAppointments: 0,
    totalCustomers: 0,
    storageUsed: '0 MB',
    lastActivity: tenant.updatedAt,
    subscriptionStatus: tenant.subscription?.status || 'none'
  };

  res.status(200).json({ 
    success: true, 
    data: metrics
  });
});
