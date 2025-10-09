const asyncHandler = require('./async');
const ErrorResponse = require('../utils/errorResponse');
const Tenant = require('../models/tenant.model');
const tenantContext = require('../utils/tenantContext');

// Extract tenant domain from host header
const extractTenantDomain = (host) => {
  if (!host) return null;

  const domain = host.split(':')[0]; // Remove port

  // Handle localhost development - superadmin domain
  if (domain === 'localhost' || domain === '127.0.0.1') {
    return null; // Superadmin mode
  }

  // Handle production - superadmin domain
  if (domain === 'www.landscape360.com' || domain === 'landscape360.com' || 
      domain === 'delxn.club' || domain === 'www.delxn.club' ||
      domain === 'backend-rochin-landscaping.onrender.com') {
    return null; // Superadmin mode
  }

  // Handle computer name domains (development)
  if (domain.includes('-') && !domain.includes('.')) {
    // This is likely a computer name like 'isaac-gomes-ernandes'
    // For development, treat this as a tenant subdomain
    return domain; // Use the computer name as tenant subdomain
  }

  // For multi-part domains like sub.example.com, return only the left-most label as subdomain
  const parts = domain.split('.');
  if (parts.length >= 3 && parts[0] !== 'www') {
    return parts[0];
  }

  // For apex custom domains (e.g., custom tenant.com), we assume subdomain stored equals the apex domain
  // Return the domain as-is in that case
  return domain;
};

// Resolve tenant from domain and set context
exports.resolveTenant = asyncHandler(async (req, res, next) => {
  // Prefer domain from header; fallback to host extraction
  const headerDomain = req.headers['x-tenant-domain'];
  const headerSubdomain = req.headers['x-tenant-subdomain'];
  // If explicit subdomain header is present, use it. Otherwise, if domain header is present, extract subdomain from it.
  const resolvedFromHeader = headerSubdomain || (headerDomain ? extractTenantDomain(headerDomain) : null);
  const tenantDomain = resolvedFromHeader || extractTenantDomain(req.headers.host);
  console.log('Tenant Resolver: headerSubdomain:', headerSubdomain, 'headerDomain:', headerDomain, 'resolved:', tenantDomain);
  // For super admin routes or no tenant domain, continue without tenant context
  if (!tenantDomain || req.path.startsWith('/api/v1/admin') || req.path.startsWith('/api/v1/super-admin')) {
    return tenantContext.run({}, next);
  }
  
  // Find tenant by subdomain (using domain as subdomain identifier)
  const tenant = await Tenant.findOne({ subdomain: tenantDomain });
  
  if (!tenant) {
    console.log('Tenant Resolver: No tenant found for domain/subdomain:', tenantDomain);
    return next(new ErrorResponse(`Tenant not found for domain: ${tenantDomain}`, 404));
  }
  console.log('Tenant Resolver: Tenant found:', tenant.name, tenant._id);
  req.tenant = tenant;
  
  // Check if tenant is active
  if (tenant.subscription?.status === 'inactive') {
    return next(new ErrorResponse('Tenant account is inactive', 403));
  }
  
  // Set tenant context
  tenantContext.run({ 
    tenantId: tenant._id,
    tenant: tenant
  }, next);
});

// Validate user belongs to correct tenant
exports.validateTenantAccess = asyncHandler(async (req, res, next) => {
  const store = tenantContext.getStore();
  
  // Skip validation for super admin
  if (req.user?.role === 'superAdmin') {
    return next();
  }
  
  // Skip validation if no tenant context (public routes)
  if (!store?.tenantId) {
    return next();
  }
  
  // Validate user belongs to the tenant
  if (req.user && req.user.tenantId?.toString() !== store.tenantId.toString()) {
    return next(new ErrorResponse('Access denied: User does not belong to this tenant', 403));
  }
  
  next();
}); 