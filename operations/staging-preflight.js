import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEALTH_LIVE_PATH = '/health/live';
const HEALTH_READY_PATH = '/health/ready';
const DEFAULT_TIMEOUT_MS = 5000;
const SYNTHETIC_ALERT_EVENT = 'staging_preflight_check';

export function parseArgs(argv = []) {
  const args = { checkAlertWebhook: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--base-url') args.baseUrl = argv[++i];
    else if (token.startsWith('--base-url=')) args.baseUrl = token.slice('--base-url='.length);
    else if (token === '--check-alert-webhook') args.checkAlertWebhook = true;
  }
  return args;
}

// Never echo the raw input back verbatim: strip query/hash so an accidentally
// pasted token or API key in a base URL is never printed in diagnostics.
function redactUrl(url) {
  const parsed = url instanceof URL ? url : new URL(url);
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  return `${parsed.protocol}//${parsed.host}${path}`;
}

export function requireStagingBaseUrl({ argBaseUrl, env = process.env } = {}) {
  const raw = argBaseUrl || env.STAGING_BASE_URL;
  if (!raw) throw new Error('A staging base URL is required: pass --base-url <url> or set STAGING_BASE_URL');

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('STAGING_BASE_URL is not a valid absolute URL');
  }

  const sandbox = env.ENVIRONMENT === 'sandbox';
  if (parsed.protocol !== 'https:' && !sandbox) {
    throw new Error('Staging base URL must use HTTPS outside sandbox (set ENVIRONMENT=sandbox to permit HTTP for local testing)');
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Staging base URL must use HTTP or HTTPS');
  }
  return parsed;
}

function pickSafe(value) {
  return (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') ? value : undefined;
}

async function fetchWithTimeout(url, { timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    const durationMs = Date.now() - startedAt;
    let body;
    try { body = await response.json(); } catch { body = undefined; }
    return { ok: response.ok, statusCode: response.status, durationMs, body };
  } catch (error) {
    return { ok: false, statusCode: null, durationMs: Date.now() - startedAt, error: error.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

// Opt-in only: posts one fixed synthetic event to the configured alert webhook
// so an operator can confirm the endpoint is reachable before relying on it.
// The webhook URL itself is never included in the returned diagnostics — some
// vendors (e.g. Slack incoming webhooks) embed a secret token in the path.
async function checkAlertWebhook(env, timeoutMs) {
  const webhookUrl = env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return { skipped: true, reason: 'ALERT_WEBHOOK_URL not configured' };
  if (!webhookUrl.startsWith('https://')) return { skipped: true, reason: 'ALERT_WEBHOOK_URL must use HTTPS' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const startedAt = Date.now();
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: SYNTHETIC_ALERT_EVENT, timestamp: new Date().toISOString() }),
      signal: controller.signal
    });
    return { skipped: false, ok: response.ok, statusCode: response.status, durationMs: Date.now() - startedAt };
  } catch (error) {
    return { skipped: false, ok: false, durationMs: Date.now() - startedAt, error: error.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

// Read-only staging preflight: GETs /health/live and /health/ready, and
// optionally POSTs one synthetic event to ALERT_WEBHOOK_URL when explicitly
// enabled. Never touches the database, never calls a payment or OAuth
// endpoint, and never prints raw secrets or unredacted response bodies.
export async function runPreflight({ argv = [], env = process.env } = {}) {
  const args = parseArgs(argv);
  const baseUrl = requireStagingBaseUrl({ argBaseUrl: args.baseUrl, env });
  const timeoutMs = Number(env.STAGING_PREFLIGHT_TIMEOUT_MS) > 0 ? Number(env.STAGING_PREFLIGHT_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;

  const live = await fetchWithTimeout(new URL(HEALTH_LIVE_PATH, baseUrl).toString(), { timeoutMs });
  const ready = await fetchWithTimeout(new URL(HEALTH_READY_PATH, baseUrl).toString(), { timeoutMs });

  const checks = {
    live: {
      path: HEALTH_LIVE_PATH,
      ok: live.ok,
      statusCode: live.statusCode,
      durationMs: live.durationMs,
      ...(live.error ? { error: live.error } : {})
    },
    ready: {
      path: HEALTH_READY_PATH,
      ok: ready.ok,
      statusCode: ready.statusCode,
      durationMs: ready.durationMs,
      ...(ready.error ? { error: ready.error } : {}),
      ...(ready.body && typeof ready.body === 'object' ? {
        status: pickSafe(ready.body.status),
        database: pickSafe(ready.body.database)
      } : {})
    }
  };

  const shouldCheckAlertWebhook = args.checkAlertWebhook
    || env.STAGING_PREFLIGHT_CHECK_ALERT_WEBHOOK === '1'
    || env.STAGING_PREFLIGHT_CHECK_ALERT_WEBHOOK === 'true';
  const alertWebhook = shouldCheckAlertWebhook ? await checkAlertWebhook(env, timeoutMs) : null;

  const pass = checks.live.ok && checks.ready.ok && (!alertWebhook || alertWebhook.skipped || alertWebhook.ok);
  return { pass, baseUrl: redactUrl(baseUrl), checks, alertWebhook };
}

async function main() {
  const result = await runPreflight({ argv: process.argv.slice(2) });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.pass ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
