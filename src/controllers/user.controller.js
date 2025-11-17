const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middlewares/async');
const User = require('../models/user.model');
const ActivityLog = require('../models/ActivityLog');

// @desc    Get all users
// @route   GET /api/v1/users
// @access  Private/Admin
exports.getUsers = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single user
// @route   GET /api/v1/users/:id
// @access  Private/Admin
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Create user
// @route   POST /api/v1/users
// @access  Private/Admin
exports.createUser = asyncHandler(async (req, res, next) => {
  const user = await User.create(req.body);

  res.status(201).json({
    success: true,
    data: user
  });
});

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private/Admin or TenantAdmin (limited)
exports.updateUser = asyncHandler(async (req, res, next) => {
  let user = await User.findById(req.params.id);

  if (!user) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }

  // Prevent password updates via this endpoint
  if (req.body && 'password' in req.body) {
    delete req.body.password;
  }

  // Tenant admin can only update users within same tenant and cannot change role/tenantId
  if (req.user && req.user.role === 'tenantAdmin') {
    // Block modifying superAdmin or cross-tenant users
    const targetTenant = user.tenantId ? user.tenantId.toString() : null;
    const requesterTenant = req.user.tenantId ? req.user.tenantId.toString() : null;

    if (!requesterTenant || !targetTenant || targetTenant !== requesterTenant) {
      return next(new ErrorResponse('Not authorized to modify this user', 403));
    }

    if (user.role === 'superAdmin') {
      return next(new ErrorResponse('Not authorized to modify this user', 403));
    }

    // Disallow privilege/tenant changes by tenantAdmin
    if (req.body) {
      if ('role' in req.body) delete req.body.role;
      if ('tenantId' in req.body) delete req.body.tenantId;
      if ('isEmailVerified' in req.body) delete req.body.isEmailVerified;
    }
  }

  user = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }

  // If requester is tenantAdmin, enforce same-tenant and prevent deleting superAdmin
  if (req.user && req.user.role === 'tenantAdmin') {
    const targetTenant = user.tenantId ? user.tenantId.toString() : null;
    const requesterTenant = req.user.tenantId ? req.user.tenantId.toString() : null;

    if (!requesterTenant || !targetTenant || targetTenant !== requesterTenant) {
      return next(new ErrorResponse('Not authorized to delete this user', 403));
    }

    if (user.role === 'superAdmin' || user.role === 'tenantAdmin') {
      return next(new ErrorResponse('Not authorized to delete this user', 403));
    }
  }

  await User.findByIdAndDelete(req.params.id);

  // Log activity: user deleted (covers tenant admin or super admin initiated deletions)
  try {
    await ActivityLog.log({
      type: 'user_deleted',
      message: `User deleted: ${user.email}`,
      userId: req.user?._id,
      tenantId: user.tenantId || undefined,
      metadata: { targetUserId: user._id.toString(), role: user.role },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
  } catch (e) {
    // Do not block deletion on logging errors
    console.warn('ActivityLog write failed:', e.message);
  }

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get staff members for tenant
// @route   GET /api/v1/users/staff
// @access  Private/TenantAdmin
exports.getStaff = asyncHandler(async (req, res, next) => {
  const tenantContext = require('../utils/tenantContext');
  const store = tenantContext.getStore();
  
  if (!store?.tenantId) {
    return next(new ErrorResponse('Tenant context required', 400));
  }

  const staff = await User.find({
    tenantId: store.tenantId,
    role: { $in: ['staff', 'tenantAdmin'] }
  }).select('-password');

  res.status(200).json({
    success: true,
    count: staff.length,
    data: staff
  });
});