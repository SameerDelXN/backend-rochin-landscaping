const crypto = require('crypto');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middlewares/async');
const tenantContext = require('../utils/tenantContext');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const sendEmail = require('../utils/sendEmail');
const validator = require('validator');
const { getTenantFrontendUrl } = require('../utils/tenantUrl');

// @desc    Register user (passwordless, sends password setup link)
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, role, phone, password } = req.body;

  // Validate fields
  if (!name || !email || !role) {
    return next(new ErrorResponse('Please provide all required fields', 400));
  }

  // Email format validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return next(new ErrorResponse('Invalid email format', 400));
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('User already exists with this email', 400));
  }

  // Get tenantId from context for non-superAdmin users
  let tenantId = undefined;
  if (role !== 'superAdmin') {
    const store = tenantContext.getStore();
    if (!store || !store.tenantId) {
      return next(new ErrorResponse('Tenant context not found for registration', 400));
    }
    tenantId = store.tenantId;
  }

  // Create user with tenantId if needed
  const user = await User.create({
    name,
    email,
    role,
    phone,
    tenantId,
    password: password || 'TEMPORARY',
    isPasswordSet: !!password,
  });

  // Only send password setup email if no password was provided
  if (!password) {
    // Generate password setup token
    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    // Send password setup email
    let setupUrl;
    if (tenantId) {
      // Fetch tenant info to derive real frontend domain
      const Tenant = require('../models/tenant.model');
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        return next(new ErrorResponse('Tenant not found', 400));
      }
      // Build from tenant config; if absent, prefer the request's public host (Origin/Host)
      setupUrl = getTenantFrontendUrl(
        tenant,
        `/auth/set-password/${resetToken}`,
        { preferHost: req.headers.origin || req.get('host') }
      );
    } else {
      // Fallback for superAdmin or no tenant: use FRONTEND_URL only
      const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
      setupUrl = `${base}/auth/set-password/${resetToken}`;
    }

    const message = `Welcome! Please set your password by visiting the following link:\n\n${setupUrl}\n\nThis link will expire in 1 hour.`;
    try {
      await sendEmail({
        email: user.email,
        subject: 'Set up your password',
        message,
      });
    } catch (err) {
      await User.findByIdAndDelete(user._id);
      return next(new ErrorResponse('Email could not be sent', 500));
    }
  }

  // Optionally create customer profile if role is customer
  if (role === 'customer') {
    console.log('Creating customer with tenantId:', tenantId);
    if (!tenantId) {
      throw new Error('tenantId is missing!');
    }
    await Customer.create({
      user: user._id,
      tenants: [tenantId], // for array schema
      tenant: tenantId,    // for singular schema
      // ... other default customer fields ...
    });
  }

  res.status(201).json({ 
    success: true, 
    message: password ? 'Registration successful. User can now log in.' : 'Registration successful. Please check your email to set your password.',
  });
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password').populate('tenantId');

  if (!user) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Tenant isolation check
  const store = tenantContext.getStore();
  if (store?.tenantId) {
    // Within a tenant context – ensure the user belongs to this tenant (unless superAdmin)
    if (user.role !== 'superAdmin') {
      const userTenantIdStr = user.tenantId && user.tenantId._id ? user.tenantId._id.toString() : user.tenantId?.toString();
      if (userTenantIdStr !== store.tenantId.toString()) {
        return next(new ErrorResponse('Invalid credentials', 401));
      }
    }
  } else {
    // No tenant context - this should not happen for tenant domains
    // The tenant resolver should have set the context
    console.log('⚠️ No tenant context found during login for domain:', req.get('host'));
  }

  // Password check
  // 
  if (!(await user.matchPassword(password))) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  const userData = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId?._id || null,
    tenantName: user.tenantId?.name || null,
  };

  sendTokenResponse(user, 200, res, userData);
});

// @desc    Log user out / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res, next) => {
  // req.user is populated by the 'protect' middleware
  const user = await User.findById(req.user.id).populate('tenantId');

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user details
// @route   PUT /api/v1/auth/updatedetails
// @access  Private
exports.updateDetails = asyncHandler(async (req, res, next) => {
  const fieldsToUpdate = {
    name: req.body.name,
    email: req.body.email
  };

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');

  if (!(await user.matchPassword(req.body.currentPassword))) {
    return next(new ErrorResponse('Password is incorrect', 401));
  }

  user.password = req.body.newPassword;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new ErrorResponse('There is no user with that email', 404));
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  let resetUrl;
  if (user.tenantId) {
    const Tenant = require('../models/tenant.model');
    const tenant = await Tenant.findById(user.tenantId);
    // Build from tenant config; if absent, prefer the request's public host (Origin/Host)
    resetUrl = getTenantFrontendUrl(
      tenant || null,
      `/reset-password/${resetToken}`,
      { preferHost: req.headers.origin || req.get('host') }
    );
  } else {
    const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    resetUrl = `${base}/reset-password/${resetToken}`;
  }
  const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please go to this URL to reset your password: \n\n ${resetUrl}`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Password reset token',
      message
    });

    res.status(200).json({ success: true, data: 'Email sent' });
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new ErrorResponse('Email could not be sent', 500));
  }
});

// @desc    Reset password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Invalid token', 400));
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Verify email
// @route   GET /api/v1/auth/verify-email/:verificationtoken
// @access  Public
exports.verifyEmail = asyncHandler(async (req, res, next) => {
  const verificationToken = crypto
    .createHash('sha256')
    .update(req.params.verificationtoken)
    .digest('hex');

  const user = await User.findOne({
    emailVerificationToken: verificationToken,
    emailVerificationExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Invalid verification token', 400));
  }

  // Mark user as verified
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Email verified successfully'
  });
});

// @desc    Handle password link
// @route   GET /api/v1/auth/set-password/:token
// @access  Public
exports.handlePasswordLink = asyncHandler(async (req, res, next) => {
  const { token } = req.params;

  // Here, you would typically render a page for the user to set their password.
  // For an API, you might just validate the token and send a success response,
  // expecting the frontend to handle the password form.
  res.status(200).send(`
    <html>
      <body>
        <h2>Set Your Password</h2>
        <form action="/api/v1/auth/set-password" method="POST">
          <input type="hidden" name="token" value="${token}" />
          <label for="password">New Password:</label>
          <input type="password" id="password" name="password" required />
          <button type="submit">Set Password</button>
        </form>
      </body>
    </html>
  `);
});

// @desc    Set password using token
// @route   POST /api/v1/auth/setpassword/:resettoken
// @access  Public
exports.setPassword = asyncHandler(async (req, res, next) => {
  const token = req.params.resettoken || req.body.token;

  if (!token) {
    return next(new ErrorResponse('Missing token', 400));
  }

  const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ErrorResponse('Invalid or expired token', 400));
  }

  const { password } = req.body;
  if (!password || !validator.isLength(password, { min: 8 })) {
    return next(new ErrorResponse('Password must be at least 8 characters long', 400));
  }

  user.password = password;
  user.isPasswordSet = true; // Optional: track if password was set
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password has been set. You can now log in.',
  });
});

exports.resetPassword = asyncHandler(async (req, res, next) => {
  const token = req.params.resettoken || req.body.token;

  if (!token) {
    return next(new ErrorResponse('Missing token', 400));
  }
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Invalid token', 400));
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});

//   if (process.env.NODE_ENV === 'production') {
//     options.secure = true;
//   }

//   res
//     .status(statusCode)
//     .cookie('token', token, options)
//     .json({
//       success: true,
//       token
//     });
// }; 

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    sameSite: 'Lax' // Default SameSite attribute
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true; // secure must be true if sameSite is 'None'
    options.sameSite = 'None';
  }

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({ success: true, token });
};