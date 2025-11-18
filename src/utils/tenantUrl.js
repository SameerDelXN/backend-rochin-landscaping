function getTenantFrontendUrl(tenantOrSubdomain, path = '', options = {}) {
  const mainDomain = process.env.BASE_DOMAIN || 'delxn.club';

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
  // Identify local/dev style hosts to prefer HTTP
  const isLocalDevHost = (host) => {
    if (!host) return false;
    const h = String(host).toLowerCase();
    // Examples that should use http: localhost:3000, 127.0.0.1:3000, ramirez-gardening:3000, <name>.127.0.0.1.nip.io:3000
    return (
      h.includes('localhost') ||
      h.includes('127.0.0.1') ||
      /:([3-9]\d{2,5})$/.test(h) || // any explicit port (e.g., :3000, :5173)
      /^[a-z0-9-]+(?::\d+)?$/.test(h) // bare host without dots (e.g., ramirez-gardening or ramirez-gardening:3000)
    );
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
  // Choose protocol: env override > local-dev detection > mainDomain heuristic
  const protocol =
    process.env.FRONTEND_PROTOCOL ||
    (isLocalDevHost(preferredHost) || String(mainDomain).startsWith('localhost') ? 'http' : 'https');

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
      // Local/dev: prefer subdomain:port (e.g., g1:3000). Production: subdomain.BASE_DOMAIN
      if (isLocalDevHost(preferredHost)) {
        const portMatch = String(preferredHost || '').match(/:(\d+)$/);
        const port = (portMatch && portMatch[1]) || process.env.FRONTEND_PORT || process.env.PORT || '3000';
        fullDomain = `${tenant.subdomain}:${port}`;
      } else {
        fullDomain = `${tenant.subdomain}.${mainDomain}`;
      }
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
      if (sub) {
        if (isLocalDevHost(preferredHost)) {
          const portMatch = String(preferredHost || '').match(/:(\d+)$/);
          const port = (portMatch && portMatch[1]) || process.env.FRONTEND_PORT || process.env.PORT || '3000';
          fullDomain = `${sub}:${port}`;
        } else {
          fullDomain = `${sub}.${mainDomain}`;
        }
      } else {
        fullDomain = normalizeDomain(mainDomain);
      }
    }
  }

  return `${protocol}://${fullDomain}${path}`;
}

module.exports = { getTenantFrontendUrl };