import { logError, logInfo, logWarn } from '../observability.js';

/**
 * Hardened IP subnet and hostname threat patterns for outbound webhook SSRF protection.
 *
 * Threat Model:
 * 1. Cloud metadata services (e.g. AWS 169.254.169.254, GCP metadata.google.internal, Azure 169.254.169.254).
 * 2. Private LAN & RFC 1918 addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8).
 * 3. Special IPv4 ranges: Carrier-grade NAT (100.64.0.0/10), Benchmark testing (198.18.0.0/15), Link-Local (169.254.0.0/16).
 * 4. IPv6 loopback, unique-local, link-local, and IPv4-mapped addresses (::1, fc00::/7, fe80::/10, ::ffff:0:0/96).
 * 5. Decimal, octal, and hexadecimal encoded IP hostnames (e.g. 2130706433, 017700000001, 0x7f000001).
 * 6. Internal / private TLDs (.local, .internal, .lan, .localhost).
 * 7. Redirect-based pivoting to private addresses: mitigated by manual redirect resolution and re-validating every Location hop.
 * 8. Production requirement: HTTPS-only protocol enforcement.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\./,                         // Loopback 127.0.0.0/8
  /^10\./,                          // Private 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private 172.16.0.0/12
  /^192\.168\./,                    // Private 192.168.0.0/16
  /^169\.254\./,                    // Link-local / Cloud metadata 169.254.0.0/16
  /^0\./,                           // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // CGNAT 100.64.0.0/10
  /^198\.(1[8-9])\./,               // Benchmark testing 198.18.0.0/15
  /^192\.0\.2\./,                   // TEST-NET-1
  /^198\.51\.100\./,                // TEST-NET-2
  /^203\.0\.113\./,                 // TEST-NET-3
  /^(22[4-9]|23[0-9]|24[0-9]|25[0-5])\./, // Multicast & Reserved (224.0.0.0/4, 240.0.0.0/4)
  /^::1$/,                          // IPv6 Loopback
  /^::$/,                           // IPv6 Unspecified
  /^fc00:/i,                        // IPv6 Unique local (fc00::/7)
  /^fd[0-9a-f]{2}:/i,               // IPv6 Unique local (fd00::/8)
  /^fe80:/i,                        // IPv6 Link-local (fe80::/10)
  /^::ffff:(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.|0\.)/i // IPv4-mapped IPv6
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.azure.internal',
  'instance-data'
];

/**
 * Checks if a hostname or IP is a forbidden private address.
 */
function isPrivateOrReservedHost(hostname, isSandbox = false) {
  const normHost = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.includes(normHost) ||
      normHost === '169.254.169.254' ||
      normHost.startsWith('169.254.') ||
      normHost.endsWith('.localhost') ||
      normHost.endsWith('.local') ||
      normHost.endsWith('.internal') ||
      normHost.endsWith('.lan')) {
    return { blocked: true, reason: 'internal_or_metadata_hostname_forbidden' };
  }

  // Check decimal IP representation (e.g. "2130706433" -> 127.0.0.1)
  if (/^\d+$/.test(normHost)) {
    const num = Number(normHost);
    if (num >= 0 && num <= 4294967295) {
      const b1 = (num >>> 24) & 255;
      const b2 = (num >>> 16) & 255;
      const b3 = (num >>> 8) & 255;
      const b4 = num & 255;
      const dotted = `${b1}.${b2}.${b3}.${b4}`;
      if (dotted.startsWith('169.254.')) {
        return { blocked: true, reason: 'internal_or_metadata_hostname_forbidden' };
      }
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(dotted)) {
          if (!isSandbox || dotted !== '127.0.0.1') return { blocked: true, reason: 'private_ip_forbidden' };
        }
      }
    }
  }

  // Check IPv4-mapped IPv6 (e.g. "::ffff:127.0.0.1" or node-normalized "::ffff:7f00:1")
  if (normHost.startsWith('::ffff:')) {
    const remainder = normHost.slice(7);
    if (remainder.includes('.')) {
      if (remainder.startsWith('169.254.')) {
        return { blocked: true, reason: 'internal_or_metadata_hostname_forbidden' };
      }
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(remainder)) {
          if (!isSandbox || remainder !== '127.0.0.1') return { blocked: true, reason: 'private_ip_forbidden' };
        }
      }
    } else {
      const parts = remainder.split(':');
      if (parts.length === 2) {
        const p1 = parseInt(parts[0], 16) || 0;
        const p2 = parseInt(parts[1], 16) || 0;
        const b1 = (p1 >> 8) & 255;
        const b2 = p1 & 255;
        const b3 = (p2 >> 8) & 255;
        const b4 = p2 & 255;
        const dotted = `${b1}.${b2}.${b3}.${b4}`;
        if (dotted.startsWith('169.254.')) {
          return { blocked: true, reason: 'internal_or_metadata_hostname_forbidden' };
        }
        for (const pattern of PRIVATE_IP_PATTERNS) {
          if (pattern.test(dotted)) {
            if (!isSandbox || dotted !== '127.0.0.1') return { blocked: true, reason: 'private_ip_forbidden' };
          }
        }
      }
    }
  }

  // Allow localhost loopback in sandbox mode ONLY for local tests
  const isLoopback = normHost === '127.0.0.1' || normHost === 'localhost' || normHost === '::1';
  if (isLoopback) {
    if (isSandbox) {
      return { blocked: false, reason: null };
    }
    return { blocked: true, reason: 'localhost_forbidden' };
  }

  // Check standard private patterns
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(normHost)) {
      return { blocked: true, reason: 'private_ip_forbidden' };
    }
  }

  return { blocked: false, reason: null };
}

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
      // Allow HTTP in sandbox for local tests
    } else {
      return { valid: false, reason: 'non_https_protocol' };
    }
  }

  // Disallow user credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'embedded_credentials_forbidden' };
  }

  const hostCheck = isPrivateOrReservedHost(parsed.hostname, isSandbox);
  if (hostCheck.blocked) {
    return { valid: false, reason: hostCheck.reason };
  }

  return { valid: true, reason: null };
}

/**
 * Dispatches an outbound webhook for a goal milestone trigger.
 * Uses manual redirect validation (redirect: 'manual') to prevent SSRF bypasses.
 *
 * @param {Object} params
 * @param {string} params.url - Destination webhook URL
 * @param {Object} params.payload - Webhook event payload
 * @param {number} [params.timeoutMs=5000] - Request timeout
 * @param {number} [params.maxRedirects=3] - Maximum redirect hops allowed
 * @returns {Promise<{ delivered: boolean, httpStatus: number|null, error: string|null }>}
 */
export async function sendMilestoneWebhook({ url, payload, timeoutMs = 5000, maxRedirects = 3 }) {
  let currentUrl = url;
  let redirectHops = 0;

  while (redirectHops <= maxRedirects) {
    const validation = validateOutboundWebhookUrl(currentUrl);
    if (!validation.valid) {
      logWarn('milestone_webhook_rejected_ssrf', { url: currentUrl, reason: validation.reason });
      return {
        delivered: false,
        httpStatus: null,
        error: `SSRF validation failed: ${validation.reason}`
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(currentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Donatio-GoalEngine/1.0',
          'X-Donatio-Event': payload.event || 'goal.milestone_reached'
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: 'manual'
      });

      clearTimeout(timeout);

      // Handle HTTP redirects securely
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) {
          return {
            delivered: false,
            httpStatus: res.status,
            error: `Redirect response missing Location header (HTTP ${res.status})`
          };
        }

        let nextUrl;
        try {
          nextUrl = new URL(location, currentUrl).toString();
        } catch {
          return {
            delivered: false,
            httpStatus: res.status,
            error: `Invalid redirect Location header: ${location}`
          };
        }

        // Revalidate the redirect target against SSRF rules
        const redirectValidation = validateOutboundWebhookUrl(nextUrl);
        if (!redirectValidation.valid) {
          logWarn('milestone_webhook_redirect_rejected_ssrf', {
            target: nextUrl,
            reason: redirectValidation.reason
          });
          return {
            delivered: false,
            httpStatus: res.status,
            error: `SSRF validation failed on redirect target: ${redirectValidation.reason}`
          };
        }

        redirectHops++;
        if (redirectHops > maxRedirects) {
          return {
            delivered: false,
            httpStatus: res.status,
            error: `Exceeded maximum redirect hops (${maxRedirects})`
          };
        }

        currentUrl = nextUrl;
        continue;
      }

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

  return {
    delivered: false,
    httpStatus: null,
    error: `Exceeded maximum redirect hops (${maxRedirects})`
  };
}

/**
 * Worker lifecycle-safe outbound webhook dispatcher with explicit status tracking and bounded retries.
 *
 * @param {Object} params
 * @param {Object} params.database - Database instance
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.goalId - Goal ID
 * @param {string|null} [params.triggerId] - Milestone Trigger ID
 * @param {string} params.url - Webhook destination URL
 * @param {Object} params.payload - Webhook event payload
 * @param {Object|null} [params.executionCtx] - Cloudflare Worker ExecutionContext
 * @param {number} [params.maxRetries=2] - Maximum retry attempts
 * @param {number} [params.retryBackoffMs=500] - Base backoff interval in ms
 * @returns {Promise<{ delivered: boolean, httpStatus: number|null, error: string|null }>}
 */
export async function dispatchMilestoneWebhookAction({
  database,
  workspaceId,
  goalId,
  triggerId = null,
  url,
  payload,
  executionCtx = null,
  maxRetries = 2,
  retryBackoffMs = 500
}) {
  if (!database || !workspaceId || !goalId || !url) {
    return { delivered: false, httpStatus: null, error: 'missing_parameters' };
  }

  const deliverTask = async () => {
    let deliveryRecord = null;
    try {
      deliveryRecord = await database.recordActionDelivery(
        workspaceId,
        goalId,
        triggerId,
        {
          actionType: 'webhook',
          targetUrl: url,
          status: 'pending'
        }
      );
    } catch (dbErr) {
      logWarn('record_action_delivery_pending_failed', { error: dbErr.message });
    }

    let finalResult = { delivered: false, httpStatus: null, error: 'unknown_failure' };

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        finalResult = await sendMilestoneWebhook({ url, payload });
        if (finalResult.delivered) {
          break;
        }

        // If SSRF rejected, abort retries immediately
        if (finalResult.error && finalResult.error.includes('SSRF validation failed')) {
          break;
        }

        if (attempt <= maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryBackoffMs * attempt));
        }
      } catch (err) {
        finalResult = { delivered: false, httpStatus: null, error: err.message };
        if (attempt <= maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryBackoffMs * attempt));
        }
      }
    }

    if (deliveryRecord?.id) {
      try {
        await database.updateActionDelivery(workspaceId, deliveryRecord.id, {
          status: finalResult.delivered ? 'delivered' : 'failed',
          httpStatus: finalResult.httpStatus,
          errorMessage: finalResult.error
        });
      } catch (updateErr) {
        logWarn('update_action_delivery_failed', { error: updateErr.message });
      }
    }

    return finalResult;
  };

  const promise = deliverTask();

  // Cloudflare Worker ExecutionContext safety
  if (executionCtx && typeof executionCtx.waitUntil === 'function') {
    executionCtx.waitUntil(promise);
  } else {
    promise.catch(err => logWarn('milestone_webhook_async_error', { error: err.message }));
  }

  return promise;
}

export default {
  validateOutboundWebhookUrl,
  sendMilestoneWebhook,
  dispatchMilestoneWebhookAction
};
