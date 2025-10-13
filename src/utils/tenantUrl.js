function getTenantFrontendUrl(tenantOrSubdomain, path = '', options = {}) {
  const mainDomain = process.env.BASE_DOMAIN || 'delxn.club';
  const protocol = process.env.FRONTEND_PROTOCOL || (String(mainDomain).startsWith('localhost') ? 'http' : 'https');

  // Normalize helper: strip protocol and trailing slash from a domain/url
  const normalizeDomain = (d) => String(d).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const extractHost = (input) => {
    if (!input) return null;
    try {
      // If full URL, use URL parser; else treat as host
      const url = input.includes('http') ? new URL(input) : null;
      const host = url ? url.host : String(input).split('/')[0];
      return String(host).toLowerCase();
    } catch (_) {
      return null;
    }
  };
  const isAdminOrLocal = (host) => {
    if (!host) return true;
    const h = host.split(':')[0].toLowerCase();
    return (
      h === 'localhost' || h === '127.0.0.1' ||
      h === 'www.landscape360.com' || h === 'landscape360.com' ||
      h === 'delxn.club' || h === 'www.delxn.club' ||
      h === 'backend-rochin-landscaping.onrender.com' ||
      h === 'backend-rochin-landscaping-beta.vercel.app'
    );
  };
  const preferredHost = extractHost(options.preferHost);

  let fullDomain;

  if (tenantOrSubdomain && typeof tenantOrSubdomain === 'object') {
    const tenant = tenantOrSubdomain;
    // Prefer custom domain if configured on tenant record
    if (Array.isArray(tenant.customDomains) && tenant.customDomains.length > 0) {
      fullDomain = normalizeDomain(tenant.customDomains[0]);
    } else if (tenant.domain) {
      fullDomain = normalizeDomain(tenant.domain);
    } else if (preferredHost && !isAdminOrLocal(preferredHost)) {
      // Use the request's origin/host when it's a public custom domain
      fullDomain = normalizeDomain(preferredHost);
    } else if (tenant.subdomain) {
      // Fall back to subdomain on the platform base domain
      fullDomain = `${tenant.subdomain}.${mainDomain}`;
    } else {
      // Final fallback to main domain
      fullDomain = normalizeDomain(mainDomain);
    }
  } else {
    // Backward compatibility: received just a subdomain string
    const sub = tenantOrSubdomain;
    if (preferredHost && !isAdminOrLocal(preferredHost)) {
      fullDomain = normalizeDomain(preferredHost);
    } else {
      fullDomain = sub ? `${sub}.${mainDomain}` : normalizeDomain(mainDomain);
    }
  }

  return `${protocol}://${fullDomain}${path}`;
}

module.exports = { getTenantFrontendUrl };