import { logError, logInfo, logWarn } from '../observability.js';

const PRIVATE_IP_PATTERNS = [
  /^127\./,                         // Loopback 127.0.0.0/8
  /^10\./,                          // Private 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private 172.16.0.0/12
  /^192\.168\./,                    // Private 192.168.0.0/16
  /^169\.254\./,                    // Link-local / Cloud metadata 169.254.0.0/16
  /^0\./,                           // 0.0.0.0/8
  /^::1$/,                          // IPv6 Loopback
  /^fc00:/i,                        // IPv6 Unique local
  /^fe80:/i                         // IPv6 Link-local
];

/**
 * Validates whether a target webhook URL is safe from SSRF.
 * @param {string} urlString
 * @param {Object} [options]
 * @param {boolean} [options.allowHttpInSandbox=true]
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function validateOutboundWebhookUrl(urlString, { allowHttpInSandbox = true } = {}) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, reason: 'empty_url' };
  }

  let parsed;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return { valid: false, reason: 'malformed_url' };
  }

  const isSandbox = process.env.ENVIRONMENT === 'sandbox';

  if (parsed.protocol !== 'https:') {
    if (parsed.protocol === 'http:' && isSandbox && allowHttpInSandbox) {
      // Allow HTTP in sandbox for testing
    } else {
      return { valid: false, reason: 'non_https_protocol' };
    }
  }

  // Disallow user credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'embedded_credentials_forbidden' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and standard loopback hostnames
  if (hostname === 'localhost' || hostname === 'localhost.localdomain' || hostname.endsWith('.localhost')) {
    if (!isSandbox) {
      return { valid: false, reason: 'localhost_forbidden' };
    }
  }

  // Block private IP address ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      if (!isSandbox) {
        return { valid: false, reason: 'private_ip_forbidden' };
      }
    }
  }

  return { valid: true, reason: null };
}

/**
 * Dispatches an outbound webhook for a goal milestone trigger.
 * Non-blocking: returns delivery status without throwing unhandled exceptions.
 *
 * @param {Object} params
 * @param {string} params.url - Destination webhook URL
 * @param {Object} params.payload - Webhook event payload
 * @param {number} [params.timeoutMs=5000] - Request timeout
 * @returns {Promise<{ delivered: boolean, httpStatus: number|null, error: string|null }>}
 */
export async function sendMilestoneWebhook({ url, payload, timeoutMs = 5000 }) {
  const validation = validateOutboundWebhookUrl(url);
  if (!validation.valid) {
    logWarn('milestone_webhook_rejected_ssrf', { reason: validation.reason });
    return {
      delivered: false,
      httpStatus: null,
      error: `SSRF validation failed: ${validation.reason}`
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Donatio-GoalEngine/1.0',
        'X-Donatio-Event': payload.event || 'goal.milestone_reached'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.ok) {
      logInfo('milestone_webhook_delivered', { httpStatus: res.status });
      return {
        delivered: true,
        httpStatus: res.status,
        error: null
      };
    } else {
      logWarn('milestone_webhook_http_error', { httpStatus: res.status });
      return {
        delivered: false,
        httpStatus: res.status,
        error: `HTTP ${res.status} ${res.statusText}`
      };
    }
  } catch (err) {
    clearTimeout(timeout);
    const errorMsg = err.name === 'AbortError' ? 'Request timed out' : (err.message || 'Network error');
    logWarn('milestone_webhook_delivery_failed', { error: errorMsg });
    return {
      delivered: false,
      httpStatus: null,
      error: errorMsg
    };
  }
}

export default {
  validateOutboundWebhookUrl,
  sendMilestoneWebhook
};
