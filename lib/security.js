export function requestOrigin(req) {
  const raw = req.get?.('origin') || req.get?.('referer') || '';
  if (!raw) return null;
  try { return new URL(raw).origin; } catch { return null; }
}

export function expectedRequestOrigin(req, configuredBaseUrl = process.env.BASE_URL) {
  if (configuredBaseUrl) {
    try { return new URL(configuredBaseUrl).origin; } catch { return null; }
  }
  const host = req.get?.('host');
  return host ? `${req.protocol || 'http'}://${host}` : null;
}

export function isSameOriginRequest(req, configuredBaseUrl = process.env.BASE_URL) {
  const actual = requestOrigin(req);
  const expected = expectedRequestOrigin(req, configuredBaseUrl);
  return Boolean(actual && expected && actual === expected);
}

export function requireSameOrigin(req, res, next) {
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: 'Invalid request origin' });
  return next();
}
