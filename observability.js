import crypto from 'node:crypto';

function write(level, event, fields = {}) {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }));
}

export function logInfo(event, fields) { write('log', event, fields); }
export function logWarn(event, fields) { write('warn', event, fields); }
export function logError(event, fields = {}) { write('error', event, fields); }

export function routeLabel(req) {
  if (req.path === '/health/live' || req.path === '/health/ready') return req.path;
  if (req.path?.startsWith('/webhook/')) return '/webhook/:slug';
  if (req.path === '/ecpay/period/callback') return req.path;
  if (req.path?.startsWith('/api/auth/')) return '/api/auth/*';
  if (req.path?.startsWith('/api/')) return '/api/*';
  return '/other';
}

export function requestObservability(req, res, next) {
  const requestId = crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logInfo('http_request_completed', { request_id: requestId, method: req.method, route: routeLabel(req), status_code: res.statusCode, duration_ms: Math.round(durationMs) });
  });
  next();
}
