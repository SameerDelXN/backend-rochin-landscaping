const asyncHandler = require('../middlewares/async');
const tenantContext = require('../utils/tenantContext');
const Tenant = require('../models/tenant.model');

// @desc    Public contact info (tenant-aware)
// @route   GET /api/v1/public/contact-info
// @access  Public
exports.getPublicContactInfo = asyncHandler(async (req, res, next) => {
  const store = tenantContext.getStore();

  // If tenant context exists, return tenant contact info
  if (store?.tenantId) {
    const tenant = await Tenant.findById(store.tenantId).select('name email phone address');
    if (tenant) {
      return res.status(200).json({
        success: true,
        data: {
          businessName: tenant.name || '',
          email: tenant.email || '',
          phone: tenant.phone || '',
          address: tenant.address || ''
        }
      });
    }
  }

  // Superadmin (main domain) fallback
  const superName = process.env.SUPERADMIN_BUSINESS_NAME || 'Gardening 360°';
  const superEmail = process.env.SUPER_ADMIN_EMAIL || 'info@gardening360.com';
  const superPhone = process.env.SUPER_ADMIN_PHONE || '000-000-0000';
  const superAddress = process.env.SUPERADMIN_ADDRESS || 'Head Office';
  const superBusinessHours = process.env.SUPERADMIN_BUSINESS_HOURS || [
    'Monday - Friday: 9:00 AM - 6:00 PM',
    'Saturday: 10:00 AM - 2:00 PM',
    'Sunday: Closed'
  ];

  return res.status(200).json({
    success: true,
    data: {
      businessName: superName,
      email: superEmail,
      phone: superPhone,
      address: superAddress,
      businessHours: Array.isArray(superBusinessHours)
        ? superBusinessHours
        : String(superBusinessHours).split('\n')
    }
  });
});
