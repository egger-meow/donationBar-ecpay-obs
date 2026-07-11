import crypto from 'node:crypto';

const DEFAULT_ALERT_TIMEOUT_MS = 3000;

// Fixed vocabulary: only these event names are eligible for external alert delivery.
// Extend deliberately alongside a documented signal in docs/operations/MONITORING_AND_INCIDENT_RESPONSE.md.
const ALERTABLE_EVENTS = new Set([
  'readiness_check_failed',
  'payment_webhook_invalid_merchant',
  'payment_webhook_decryption_failed',
  'payment_webhook_unexpected_error',
  'subscription_initial_callback_failed',
  'subscription_callback_unexpected_error',
  'http_unhandled_error'
]);

function write(level, event, fields = {}) {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }));
}

export function logInfo(event, fields) { write('log', event, fields); }
export function logWarn(event, fields) { write('warn', event, fields); }
export function logError(event, fields = {}) { write('error', event, fields); }

// Best-effort external alert delivery for a fixed set of operational signals.
// Never throws and never blocks its caller: failures are logged locally, not surfaced.
// Payload is limited to the event name, timestamp, request ID, route label, and HTTP
// status code — never raw request/response bodies, donor data, or credentials.
export async function sendAlert(event, fields = {}, env = process.env) {
  if (!ALERTABLE_EVENTS.has(event)) return;
  const webhookUrl = env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const { requestId, route, statusCode } = fields;
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...(requestId ? { request_id: requestId } : {}),
    ...(route ? { route } : {}),
    ...(statusCode ? { status_code: statusCode } : {})
  };

  const timeoutMs = Number(env.ALERT_WEBHOOK_TIMEOUT_MS) > 0 ? Number(env.ALERT_WEBHOOK_TIMEOUT_MS) : DEFAULT_ALERT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  timeoutId.unref?.();
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch {
    logWarn('alert_delivery_failed', { alert_event: event });
  } finally {
    clearTimeout(timeoutId);
  }
}

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
