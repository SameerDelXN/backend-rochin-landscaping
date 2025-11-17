function getClientIp(req) {
  try {
    // Prefer X-Forwarded-For (may contain a list: client, proxy1, proxy2)
    const xff = (req.headers['x-forwarded-for'] || '')
      .toString()
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    let ip = xff.length ? xff[0] : (req.headers['x-real-ip'] || req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '');

    if (!ip) return '';

    // Strip IPv6 prefix ::ffff:
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);

    // Map IPv6 localhost variants to IPv4 localhost
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') ip = '127.0.0.1';

    // Basic sanitation
    return ip.replace(/[^0-9a-fA-F:\.]/g, '');
  } catch (_) {
    return '';
  }
}

module.exports = { getClientIp };
