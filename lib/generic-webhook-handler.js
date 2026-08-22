import crypto from 'crypto';
import { normalizeGenericWebhookPayload } from './source-adapters/generic-webhook-adapter.js';
import { logInfo, logWarn } from './observability.js';

/**
 * Securely verifies a webhook token using timing-safe comparison.
 * @param {string} receivedToken
 * @param {string} expectedToken
 * @returns {boolean}
 */
export function verifyWebhookToken(receivedToken, expectedToken) {
  if (!receivedToken || !expectedToken) return false;
  const receivedBuf = Buffer.from(String(receivedToken).trim());
  const expectedBuf = Buffer.from(String(expectedToken).trim());
  if (receivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

/**
 * Extracts authentication token from headers (x-webhook-token or Authorization Bearer).
 * @param {Object} headers
 * @returns {string|null}
 */
export function extractWebhookToken(headers = {}) {
  const tokenHeader = headers['x-webhook-token'] || headers['X-Webhook-Token'] || '';
  if (tokenHeader && typeof tokenHeader === 'string') {
    return tokenHeader.trim();
  }
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * Processes an incoming Generic Inbound Webhook payload.
 *
 * @param {Object} options
 * @param {string} options.slug - The workspace slug
 * @param {string} options.authToken - Token from headers
 * @param {Object} options.body - The parsed JSON body
 * @param {string|null} options.requestId - Request ID for structured logging
 * @param {Object} options.database - The database service instance
 * @returns {Promise<{ statusCode: number, body: Object, workspaceId?: string, event?: Object, wasDuplicate?: boolean }>}
 */
export async function processGenericWebhook({
  slug,
  authToken,
  body,
  requestId = null,
  database
}) {
  if (!slug) {
    return { statusCode: 404, body: { error: 'Workspace not found' } };
  }

  const workspace = await database.getWorkspaceBySlug(slug);
  if (!workspace) {
    logWarn('generic_webhook_workspace_not_found', { request_id: requestId, slug });
    return { statusCode: 404, body: { error: 'Workspace not found' } };
  }

  if (!authToken) {
    logWarn('generic_webhook_missing_token', { request_id: requestId, slug });
    return { statusCode: 401, body: { error: 'Missing webhook authentication token' } };
  }

  const expectedToken = await database.getGenericWebhookToken(workspace.id);
  if (!expectedToken) {
    logWarn('generic_webhook_unconfigured', { request_id: requestId, slug });
    return { statusCode: 401, body: { error: 'Webhook token not configured for workspace' } };
  }

  if (!verifyWebhookToken(authToken, expectedToken)) {
    logWarn('generic_webhook_invalid_token', { request_id: requestId, slug });
    return { statusCode: 401, body: { error: 'Invalid webhook authentication token' } };
  }

  let revenueEvent;
  try {
    revenueEvent = normalizeGenericWebhookPayload(body, { workspaceId: workspace.id });
  } catch (normErr) {
    logWarn('generic_webhook_validation_failed', { request_id: requestId, reason: normErr.message });
    return { statusCode: 400, body: { error: normErr.message } };
  }

  const result = await database.addRevenueEvent(workspace.id, revenueEvent);

  if (result.duplicate) {
    logInfo('generic_webhook_duplicate', {
      request_id: requestId,
      event_id: revenueEvent.id,
      external_event_id: revenueEvent.externalEventId
    });
    return {
      statusCode: 200,
      body: {
        status: 'success',
        duplicate: true,
        eventId: result.event?.id || revenueEvent.id
      },
      workspaceId: workspace.id,
      event: revenueEvent,
      wasDuplicate: true
    };
  }

  logInfo('generic_webhook_processed', { request_id: requestId, event_id: revenueEvent.id });
  return {
    statusCode: 201,
    body: {
      status: 'success',
      duplicate: false,
      eventId: revenueEvent.id
    },
    workspaceId: workspace.id,
    event: revenueEvent,
    wasDuplicate: false
  };
}
