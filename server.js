import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import database from './lib/database.js';
import * as emailService from './lib/email.js';
import { getBillingECPayCredentials, getECPayCheckoutUrl, getECPayPeriodActionUrl, getSubscriptionPlan, isProduction, validateProductionConfig } from './lib/config.js';
import { generateCheckMacValueForCredentials, verifyCheckMacValueForCredentials, verifyCheckMacValueForRawBody } from './lib/ecpay.js';
import { requireSameOrigin } from './lib/security.js';
import { logError, logInfo, logWarn, requestObservability, sendAlert } from './lib/observability.js';
import { processSubscriptionPaymentCallback as processSubscriptionPaymentCallbackCore } from './lib/subscription-callback.js';
import { computeActivationSteps } from './lib/activation.js';
import { buildAccountExport } from './lib/privacy-export.js';
import { GENERAL_RATE_LIMIT, PROVIDER_CALLBACK_RATE_LIMIT, isProviderCallbackPath } from './lib/rate-limit-policy.js';
import { getHelmetOptions } from './lib/security-headers.js';
import { createDonationTradeNo, createSubscriptionTradeNo } from './lib/trade-number.js';
import { formatECPayDate } from './lib/ecpay-date.js';
import { createTestDonationEvent } from './lib/donation-event.js';
import { maybeActivateFreePass } from './lib/easter-egg.js';
import { MAX_MEDIA_BYTES, validateAudioDataUrl, validateImageDataUrl } from './lib/media-upload.js';
import { normalizeEcpayPaidDonation, normalizeEcpayPaidRevenueEvent, normalizeEcpayReturn, normalizeEcpayReturnRevenueEvent } from './providers/ecpay-donation-adapter.js';
import { normalizeGenericWebhookPayload } from './lib/source-adapters/generic-webhook-adapter.js';
import { extractWebhookToken, processGenericWebhook } from './lib/generic-webhook-handler.js';
import { createManualRevenueEvent } from './lib/source-adapters/manual-adapter.js';
import { createTestRevenueEvent } from './lib/source-adapters/test-adapter.js';
import { getActiveSources, getSourceDefinition } from './lib/source-registry.js';

const app = express();
const __dirname = path.resolve();
const production = isProduction();

validateProductionConfig();
if (production) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet(getHelmetOptions({ production })));
// Public traffic must not consume a payment-provider callback's rate-limit budget.
// Callback routes receive their own deliberately higher, narrowly scoped guard below.
app.use(rateLimit({
  windowMs: 60_000,
  limit: GENERAL_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: req => isProviderCallbackPath(req.path)
}));
const providerCallbackRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: PROVIDER_CALLBACK_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
app.use('/webhook', providerCallbackRateLimiter);
app.use('/api/webhook/generic', providerCallbackRateLimiter);
app.use('/ecpay/period/callback', providerCallbackRateLimiter);
app.use(requestObservability);

// Middleware
const protectedStaticPages = new Set(['/admin.html', '/overlay.html', '/donate.html']);
app.use((req, res, next) => {
  const normalizedPath = req.path.replace(/\/+$/, '') || '/';
  if (protectedStaticPages.has(normalizedPath)) return res.status(404).send('Not found');
  return next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({
  extended: false,
  verify: (req, res, buffer) => {
    // Preserve provider bytes before parsing for CheckMacValue verification. Never log
    // or include this raw body in responses or operational events.
    req.rawFormBody = Buffer.from(buffer);
  }
}));
// Media upload routes carry base64 image/audio data URLs (up to MAX_MEDIA_BYTES, which
// is ~33% larger once base64-encoded), so they need a much higher body limit than every
// other JSON route. Scope the larger limit to just those admin-only, authenticated paths
// instead of raising the global default and widening the DoS surface for everything else.
const MEDIA_UPLOAD_PATHS = ['/admin/donation-banner', '/admin/alert-image', '/admin/alert-sound'];
app.use((req, res, next) => {
  if (MEDIA_UPLOAD_PATHS.includes(req.path)) return next();
  return bodyParser.json()(req, res, next);
});
app.use(MEDIA_UPLOAD_PATHS, bodyParser.json({ limit: '8mb' }));

// Session middleware
const PgSession = connectPgSimple(session);
app.use(session({
  store: production ? new PgSession({ conString: process.env.DATABASE_URL, createTableIfMissing: true }) : undefined,
  secret: process.env.SESSION_SECRET || 'super-secret',
  resave: false,
  saveUninitialized: false,
  name: 'donationbar.sid',
  cookie: { secure: production, httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
app.get('/api/pricing', (req, res) => {
  const plan = getSubscriptionPlan();
  res.set('Cache-Control', 'no-store');
  res.json({
    plan: plan.phase,
    currency: plan.currency,
    monthlyPrice: plan.monthlyPrice,
    trialDays: plan.trialDays
  });
});
app.get('/health/ready', async (req, res) => {
  const databaseHealth = await database.healthCheck();
  if (!databaseHealth.ok) {
    sendAlert('readiness_check_failed', { requestId: req.requestId, route: '/health/ready', statusCode: 503 });
  }
  return res.status(databaseHealth.ok ? 200 : 503).json({
    status: databaseHealth.ok ? 'ready' : 'not_ready',
    database: databaseHealth.storage
  });
});

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await database.findUserById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Fraud Prevention: Generate device fingerprint from request
function generateDeviceFingerprint(req) {
  // Normalize IP address to prevent IPv4/IPv6 format mismatches
  let ip = req.ip || req.connection.remoteAddress || '';

  // Convert IPv6-mapped IPv4 addresses to pure IPv4
  // ::ffff:127.0.0.1 → 127.0.0.1
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  // Convert IPv6 localhost to IPv4
  // ::1 → 127.0.0.1
  if (ip === '::1') {
    ip = '127.0.0.1';
  }

  // Combine multiple device identifiers
  const components = [
    ip,
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || ''
  ];

  const raw = components.join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
    passReqToCallback: true // Enable access to req in callback
  },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists by OAuth provider ID
        let user = await database.findUserByEmail(profile.emails[0].value);

        if (!user) {
          // === FRAUD PREVENTION: Check if device already used trial ===
          const fingerprint = generateDeviceFingerprint(req);
          const hasUsedTrial = await database.hasUsedTrial(fingerprint);

          if (hasUsedTrial) {
            logWarn('trial_abuse_detected');
            // Create user without trial (direct to free plan or require payment)
            user = await database.createUser({
              email: profile.emails[0].value,
              username: profile.emails[0].value.split('@')[0] + '-' + Date.now(),
              passwordHash: null,
              displayName: profile.displayName,
              authProvider: 'google',
              oauthProviderId: profile.id,
              emailVerified: true
            });

            // No trial - create free plan instead
            await database.createSubscription(user.id, {
              planType: 'free',
              status: 'active',
              isTrial: false,
              pricePerMonth: 0
            });

            logInfo('trial_abuse_fallback_applied');
          } else {
            // Normal flow - create user with trial
            user = await database.createUser({
              email: profile.emails[0].value,
              username: profile.emails[0].value.split('@')[0] + '-' + Date.now(),
              passwordHash: null,
              displayName: profile.displayName,
              authProvider: 'google',
              oauthProviderId: profile.id,
              emailVerified: true
            });

            // Create trial subscription (30 days by default)
            await database.createSubscription(user.id, {
              planType: 'trial',
              status: 'active',
              isTrial: true
              // trialEndDate will be automatically calculated in database.createSubscription()
            });

            // Record trial usage to prevent future abuse
            await database.recordTrialUsage(user.id, fingerprint, {
              ipAddress: req.ip || req.connection.remoteAddress,
              userAgent: req.headers['user-agent'],
              email: user.email
            });
          }

          // Check if any workspaces exist
          const allWorkspaces = await database.getAllWorkspaces();
          const isFirstWorkspace = allWorkspaces.length === 0;

          // Create workspace - use 'default' slug for first workspace
          await database.createWorkspace(user.id, {
            workspaceName: isFirstWorkspace ? 'Default Workspace' : `${profile.displayName}'s Workspace`,
            slug: isFirstWorkspace ? 'default' : user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')
          });

          logInfo('oauth_user_created');
        } else {
          // Existing user - check if they have a workspace
          logInfo('oauth_existing_user_login');

          const userWorkspaces = await database.getUserWorkspaces(user.id);
          if (!userWorkspaces || userWorkspaces.length === 0) {
            logInfo('oauth_workspace_missing_creating');

            // Check if any workspaces exist in the system
            const allWorkspaces = await database.getAllWorkspaces();
            const isFirstWorkspace = allWorkspaces.length === 0;

            // Create workspace for existing user
            await database.createWorkspace(user.id, {
              workspaceName: isFirstWorkspace ? 'Default Workspace' : `${user.displayName || user.username}'s Workspace`,
              slug: isFirstWorkspace ? 'default' : user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')
            });

            logInfo('oauth_workspace_created_for_existing_user');
          }
        }

        return done(null, user);
      } catch (error) {
        logError('google_oauth_failed');
        return done(error, null);
      }
    }
  ));
  logInfo('google_oauth_configured');
} else {
  logWarn('google_oauth_not_configured');
}

const DB_PATH = path.join(__dirname, 'db.json');
const DEFAULT_WORKSPACE_SLUG = 'default';

// Helper: Get default workspace (for backward compatibility)
async function getDefaultWorkspace() {
  const workspace = await database.getWorkspaceBySlug(DEFAULT_WORKSPACE_SLUG);
  if (!workspace) {
    logWarn('default_workspace_missing');
    return null;
  }
  return workspace;
}

// Helper: Get workspace by slug or default (for multi-user URLs)
async function getWorkspaceFromSlug(slug = null) {
  if (slug) {
    return await database.getWorkspaceBySlug(slug);
  }
  return await getDefaultWorkspace();
}

// Helper: Get logged-in user's workspace from session
async function getUserWorkspaceFromSession(req) {
  if (!req.session || !req.session.userId) {
    logWarn('workspace_resolution_no_session');
    return null;
  }

  logInfo('workspace_resolution_started');

  const workspaces = await database.getUserWorkspaces(req.session.userId);

  if (!workspaces || workspaces.length === 0) {
    logWarn('workspace_resolution_not_found');
    return null;
  }

  logInfo('workspace_resolution_completed');

  // Return the first workspace (users typically have one)
  return workspaces[0];
}

// ECPay credential helpers (workspace-scoped)
async function getECPayCredentials(workspaceId = null) {
  if (!workspaceId) {
    const workspace = await getDefaultWorkspace();
    if (!workspace) {
      // Return default env credentials if no workspace
      return {
        merchantId: process.env.MERCHANT_ID || '',
        hashKey: process.env.HASH_KEY || '',
        hashIV: process.env.HASH_IV || ''
      };
    }
    workspaceId = workspace.id;
  }

  const provider = await database.getPaymentProvider(workspaceId, 'ecpay');

  if (provider && provider.merchantId && provider.hashKey && provider.hashIV) {
    return {
      merchantId: provider.merchantId,
      hashKey: provider.hashKey,
      hashIV: provider.hashIV
    };
  }

  // Fallback to environment variables (legacy)
  const envCredentials = {
    merchantId: process.env.MERCHANT_ID,
    hashKey: process.env.HASH_KEY,
    hashIV: process.env.HASH_IV
  };

  // Auto-migrate from ENV to database if available
  if (envCredentials.merchantId && envCredentials.hashKey && envCredentials.hashIV) {
    await database.upsertPaymentProvider(workspaceId, {
      providerName: 'ecpay',
      merchantId: envCredentials.merchantId,
      hashKey: envCredentials.hashKey,
      hashIV: envCredentials.hashIV,
      isActive: true
    });
    await database.markWorkspaceProviderConfigured(workspaceId);
    logInfo('ecpay_credentials_migrated_from_env');
    return envCredentials;
  }

  return envCredentials;
}

// SSE: Server-Sent Events for real-time updates
// Store workspace and authorization metadata. The same SSE stream serves public OBS
// overlays and owner-facing admin UI, so sensitive operational notifications must be
// delivered only to the latter.
// Map<Response, { workspaceId: string, canReceiveAdminNotifications: boolean }>
const sseClients = new Map();

async function broadcastProgress(workspaceId = null, transientDonationEvent = null) {
  try {
    if (!workspaceId) {
      const workspace = await getDefaultWorkspace();
      if (!workspace) {
        logWarn('broadcast_progress_no_workspace');
        return;
      }
      workspaceId = workspace.id;
    }

    const data = await getProgress(workspaceId);
    if (!data) {
      logError('sse_progress_data_unavailable');
      return;
    }

    // A sandbox activation check can exercise the real OBS/SSE path without
    // persisting a fake donation or advancing firstDonationAt. The payload is
    // intentionally shaped like the canonical public donation event.
    if (transientDonationEvent) {
      const transientDonation = {
        alertId: `test-${transientDonationEvent.externalId}`,
        amount: transientDonationEvent.amount,
        payer: transientDonationEvent.payer,
        message: transientDonationEvent.message,
        at: new Date().toISOString()
      };
      data.latestDonation = transientDonation;
      if (data.donations && data.donations.length > 0) {
        data.donations = [transientDonation, ...data.donations].slice(0, data.donations.length);
      } else if (data.donations && data.donations.length === 0 && data.overlaySettings?.donationDisplayMode !== 'hidden') {
        data.donations = [transientDonation];
      }
    }

    const payload = `data: ${JSON.stringify(data)}\n\n`;

    // Only broadcast to clients watching this specific workspace
    let successCount = 0;
    let errorCount = 0;

    for (const [res, client] of sseClients.entries()) {
      if (client.workspaceId === workspaceId) {
        try {
          if (!res.writableEnded && !res.destroyed) {
            res.write(payload);
            successCount++;
          } else {
            sseClients.delete(res);
            errorCount++;
          }
        } catch (error) {
          logWarn('sse_progress_write_failed');
          sseClients.delete(res);
          errorCount++;
        }
      }
    }

    logInfo('sse_progress_broadcast_completed', { successCount, errorCount, donationCount: data.donations?.length || 0 });
  } catch (error) {
    logError('sse_progress_broadcast_failed');
  }
}

// donationBannerImage belongs to /donate, not the OBS overlay — drop it before sending
// overlay settings to overlay.html so a multi-MB banner isn't pushed to every browser
// source on unrelated appearance changes.
function forOverlayClient(overlaySettings) {
  const { donationBannerImage, ...rest } = overlaySettings || {};
  return rest;
}

async function broadcastOverlaySettings(workspaceId = null) {
  try {
    if (!workspaceId) {
      const workspace = await getDefaultWorkspace();
      if (!workspace) {
        logWarn('broadcast_overlay_settings_no_workspace');
        return;
      }
      workspaceId = workspace.id;
    }

    const settings = await database.getWorkspaceSettings(workspaceId);
    const payload = `event: overlay-settings\ndata: ${JSON.stringify(forOverlayClient(settings?.overlaySettings))}\n\n`;

    // Only broadcast to clients watching this specific workspace
    for (const [res, client] of sseClients.entries()) {
      if (client.workspaceId === workspaceId) {
        try {
          if (!res.writableEnded && !res.destroyed) {
            res.write(payload);
          } else {
            sseClients.delete(res);
          }
        } catch (error) {
          logWarn('sse_overlay_settings_write_failed');
          sseClients.delete(res);
        }
      }
    }

    logInfo('overlay_settings_broadcast_completed');
  } catch (error) {
    logError('sse_overlay_settings_broadcast_failed');
  }
}

// Broadcast admin notifications (warnings/errors) to connected admin panels
function broadcastAdminNotification(workspaceId, type, message, details = null) {
  const notification = {
    type,      // 'warning', 'error', 'info'
    message,
    details,
    timestamp: new Date().toISOString()
  };
  const payload = `event: admin-notification\ndata: ${JSON.stringify(notification)}\n\n`;

  // Never send payment/provider operational detail to public overlays or donation-page
  // clients. Only an authenticated owner connection for this workspace may receive it.
  for (const [res, client] of sseClients.entries()) {
    if (client.workspaceId === workspaceId && client.canReceiveAdminNotifications) {
      try {
        if (!res.writableEnded && !res.destroyed) {
          res.write(payload);
        } else {
          sseClients.delete(res);
        }
      } catch (error) {
        logWarn('sse_admin_notification_write_failed');
        sseClients.delete(res);
      }
    }
  }

  logInfo('admin_notification_broadcast', { type });
}

// SSE endpoint - supports slug query parameter for workspace-specific updates
app.get('/events', requireActiveSubscription, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Get workspace from slug if provided
  const { slug } = req.query;
  let workspace = null;
  if (slug) {
    workspace = await getWorkspaceFromSlug(slug);
    if (!workspace) {
      logWarn('sse_workspace_not_found');
      res.write(`data: ${JSON.stringify({ error: 'Workspace not found' })}\n\n`);
      return res.end();
    }
  } else {
    workspace = await getDefaultWorkspace();
    if (!workspace) {
      logError('sse_default_workspace_missing');
      res.write(`data: ${JSON.stringify({ error: 'No workspace found' })}\n\n`);
      return res.end();
    }
  }

  logInfo('sse_client_connected');

  // Only the overlay page identifies itself with source=overlay; admin/donate pages
  // also use this stream for live UI updates and must not count as OBS activation.
  if (req.query.source === 'overlay') {
    database.markWorkspaceObsConnected(workspace.id).catch(() => {});
  }

  // Send initial data for the specified workspace
  res.write(`data: ${JSON.stringify(await getProgress(workspace.id))}\n\n`);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 30000);

  // Public overlays use this same endpoint. Only the workspace owner gets admin
  // notification events; progress and overlay-settings events remain workspace-scoped.
  sseClients.set(res, {
    workspaceId: workspace.id,
    canReceiveAdminNotifications: req.session?.userId === workspace.userId
  });

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
    logInfo('sse_client_disconnected');
  });
});

// Helper functions (workspace-scoped)
async function getProgress(workspaceId = null) {
  if (!workspaceId) {
    const workspace = await getDefaultWorkspace();
    if (!workspace) {
      // No workspace yet - return empty progress
      return {
        title: '斗內目標',
        current: 0,
        actualDonations: 0,
        startFrom: 0,
        goal: 1000,
        percent: 0,
        donations: []
      };
    }
    workspaceId = workspace.id;
  }

  const progress = await database.getWorkspaceProgress(workspaceId);
  if (!progress) {
    return {
      title: '斗內目標',
      current: 0,
      actualDonations: 0,
      startFrom: 0,
      goal: 1000,
      percent: 0,
      donations: []
    };
  }

  const actualDonations = progress.total || 0;
  const startFrom = progress.goal.startFrom || 0;
  const current = actualDonations + startFrom;
  const goal = progress.goal.amount;
  const percent = Math.min(100, Math.round((current / goal) * 100));

  // Get donation display mode
  const displayMode = progress.overlaySettings?.donationDisplayMode || 'top';
  const displayCount = progress.overlaySettings?.donationDisplayCount || 3;
  let displayDonations = [];

  if (displayMode === 'hidden') {
    displayDonations = [];
  } else if (displayMode === 'latest') {
    displayDonations = progress.donations.slice(0, displayCount);
  } else {
    displayDonations = [...progress.donations]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, displayCount);
  }

  return {
    title: progress.goal.title,
    current,
    actualDonations,
    startFrom,
    goal,
    percent,
    donations: displayDonations,
    latestDonation: progress.donations[0] || null,
    bannerImage: progress.overlaySettings?.donationBannerImage || null
  };
}

async function addDonation(workspaceId, donationEvent) {
  const success = await database.addDonation(workspaceId, {
    tradeNo: donationEvent.externalId,
    amount: donationEvent.amount,
    currency: donationEvent.currency,
    payerName: donationEvent.payer,
    message: donationEvent.message,
    paymentProviderId: donationEvent.providerRecordId
  });
  if (success) {
    await broadcastProgress(workspaceId);
    database.markWorkspaceFirstDonation(workspaceId).catch(() => {});
  }
  return success;
}

// ECPay URL encoding (different from standard encodeURIComponent)
function ecpayUrlEncode(str) {
  // 先做一般的 encodeURIComponent
  let encoded = encodeURIComponent(str);

  // ECPay 要求空白使用 '+'，且以下符號需還原為原字元
  encoded = encoded
    .replace(/%20/g, '+')
    .replace(/%2D/gi, '-')
    .replace(/%5F/gi, '_')
    .replace(/%2E/gi, '.')
    .replace(/%21/gi, '!')
    .replace(/%2A/gi, '*')
    .replace(/%28/gi, '(')
    .replace(/%29/gi, ')');

  return encoded.toLowerCase();
}

// ECPay CheckMacValue generation
async function generateCheckMacValue(params, workspaceId = null) {
  const credentials = await getECPayCredentials(workspaceId);
  const hashKey = credentials.hashKey;
  const hashIV = credentials.hashIV;

  // 1) 排除 CheckMacValue，依 Key 排序
  const sorted = Object.keys(params)
    .filter(k => k !== 'CheckMacValue')
    .sort((a, b) => a.localeCompare(b))
    .map(k => `${k}=${params[k]}`)
    .join('&');

  // 2) 包上 HashKey / HashIV
  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;

  // 3) 依 ECPay 規則 UrlEncode + toLowerCase
  const urlEncoded = ecpayUrlEncode(raw);

  // 4) SHA256 → toUpperCase
  return crypto.createHash('sha256').update(urlEncoded).digest('hex').toUpperCase();
}

async function verifyCheckMacValue(params, workspaceId = null, rawBody = null) {
  if (!params || !params.CheckMacValue) return false;
  if (rawBody) {
    const credentials = await getECPayCredentials(workspaceId);
    return verifyCheckMacValueForRawBody(rawBody, credentials);
  }
  const mac = await generateCheckMacValue(params, workspaceId);
  return mac === params.CheckMacValue;
}

function generateCheckMacValueWithCredentials(params, credentials) {
  return generateCheckMacValueForCredentials(params, credentials);
}

function verifyCheckMacValueWithCredentials(params, credentials) {
  return verifyCheckMacValueForCredentials(params, credentials);
}

async function processSubscriptionPaymentCallback(payload, rawBody = null) {
  return processSubscriptionPaymentCallbackCore(payload, {
    credentials: getBillingECPayCredentials(),
    database,
    monthlyPrice: getSubscriptionPlan().monthlyPrice,
    rawBody
  });
}

async function cancelECPaySubscription(merchantTradeNo) {
  if (process.env.ENVIRONMENT === 'sandbox') return;
  const credentials = getBillingECPayCredentials();
  const params = {
    MerchantID: credentials.merchantId,
    MerchantTradeNo: merchantTradeNo,
    Action: 'Cancel',
    TimeStamp: Math.floor(Date.now() / 1000)
  };
  params.CheckMacValue = generateCheckMacValueWithCredentials(params, credentials);
  const response = await fetch(getECPayPeriodActionUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`ECPay cancellation returned HTTP ${response.status}`);
  const result = Object.fromEntries(new URLSearchParams(await response.text()));
  if (String(result.RtnCode) !== '1') throw new Error(`ECPay cancellation failed: ${String(result.RtnMsg || 'unknown error').slice(0, 120)}`);
  if (result.CheckMacValue && !verifyCheckMacValueWithCredentials(result, credentials)) throw new Error('ECPay cancellation response checksum was invalid');
}

// Helper to decode ECPay's URL-encoded JSON
function decodeECPayJsonLike(str) {
  // ECPay encodes spaces as '+', and uses percent-encoding with lowercased hex
  // Convert '+' -> space and percent-decode safely
  return decodeURIComponent(String(str).replace(/\+/g, '%20'));
}

// ECPay Data decryption for webhook (AES-CBC)
async function decryptECPayData(encryptedData, workspaceId = null, credentialOverride = null) {
  const { hashKey, hashIV } = credentialOverride || await getECPayCredentials(workspaceId);

  try {
    if (typeof encryptedData !== 'string' || !encryptedData.trim()) {
      throw new Error('Invalid Data payload');
    }

    // AES-128-CBC with PKCS#7 padding (Node's default)
    const key = Buffer.from(hashKey, 'utf8');
    const iv = Buffer.from(hashIV, 'utf8');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // ECPay returns URL-encoded JSON, e.g. "%7b%22RtnCode%22%3a1...%7d"
    const jsonText = decodeECPayJsonLike(decrypted);

    const obj = JSON.parse(jsonText);
    logInfo('ecpay_decryption_succeeded');
    return obj;
  } catch (error) {
    logWarn('ecpay_decryption_failed');
    return null;
  }
}

// Authentication middleware - Check if user is logged in
function requireAdmin(req, res, next) {
  // Check if user is authenticated (has session with userId)
  if (req.session && req.session.userId) {
    return next();
  }

  // Return JSON error for API requests (AJAX)
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Please login first' });
  }

  return res.redirect('/login');
}

// Alias for requireAdmin (used by subscription routes)
const requireAuth = requireAdmin;

// Workspace-owner self-service data export. The pure allowlist in privacy-export.js
// prevents credentials, payment references, and internal authentication fields from
// being included even though this is an authenticated download.
app.get('/account/export', requireAuth, async (req, res) => {
  try {
    const account = await database.findUserById(req.session.userId);
    if (!account) return res.status(401).json({ error: 'Unauthorized' });

    const [subscription, ownedWorkspaces] = await Promise.all([
      database.getUserSubscription(account.id),
      database.getUserWorkspaces(account.id)
    ]);
    const workspaces = await Promise.all(ownedWorkspaces.map(async workspace => {
      const [settings, provider, donations] = await Promise.all([
        database.getWorkspaceSettings(workspace.id),
        database.getPaymentProvider(workspace.id, 'ecpay'),
        database.getAllWorkspaceDonations(workspace.id)
      ]);
      return { workspace, settings, provider, donations };
    }));

    const filenameDate = new Date().toISOString().slice(0, 10);
    res.set({
      'Cache-Control': 'no-store, private',
      'Content-Disposition': `attachment; filename="donationbar-data-export-${filenameDate}.json"`,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    });
    logInfo('account_export_completed', { workspaceCount: workspaces.length });
    return res.send(JSON.stringify(buildAccountExport({ account, subscription, workspaces })));
  } catch (error) {
    logError('account_export_failed', { request_id: req.requestId });
    return res.status(500).json({ error: 'internal_error' });
  }
});

// =============================================
// ROOT ROUTE - Redirect based on auth status
// =============================================
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/admin');
  }
  return res.redirect('/login.html');
});

// =============================================
// API ROUTES (Multi-User Support)
// =============================================

// Progress endpoint - supports slug query parameter for multi-user
app.get('/progress', requireActiveSubscription, async (req, res) => {
  try {
    const { slug } = req.query;
    const workspace = await getWorkspaceFromSlug(slug);
    const progress = await getProgress(workspace?.id);
    res.json(progress);
  } catch (error) {
    logError('progress_fetch_failed', { request_id: req.requestId });
    res.status(500).json({
      error: 'Failed to load progress',
      title: '斗內目標',
      current: 0,
      goal: 1000,
      percent: 0,
      donations: []
    });
  }
});

// =============================================
// PAGE ROUTES (Multi-User Support)
// =============================================

// Middleware: Check if workspace owner has active subscription
async function requireActiveSubscription(req, res, next) {
  try {
    const slug = req.params.slug || req.query.slug || DEFAULT_WORKSPACE_SLUG;
    const workspace = await getWorkspaceFromSlug(slug);

    if (!workspace) {
      logWarn('subscription_check_workspace_not_found');
      return res.redirect('/subscription-required.html?from=' + (req.path.includes('overlay') ? 'overlay' : 'donate'));
    }

    // Get workspace owner's subscription
    const subscription = await database.getUserSubscription(workspace.userId);

    if (!subscription) {
      logWarn('subscription_check_no_subscription');
      return res.redirect('/subscription-required.html?from=' + (req.path.includes('overlay') ? 'overlay' : 'donate'));
    }

    // Check if subscription allows access
    const allowedPlans = ['trial', 'free_pass', 'basic', 'pro', 'enterprise'];
    const gracePeriodEnd = subscription.gracePeriodEndAt ? new Date(subscription.gracePeriodEndAt) : null;
    const hasCancellationGrace = subscription.status === 'cancelled' && gracePeriodEnd && gracePeriodEnd > new Date();
    const isActive = subscription.status === 'active' || hasCancellationGrace;
    const hasValidPlan = allowedPlans.includes(subscription.planType);

    // Check if trial has expired
    if (subscription.isTrial && subscription.trialEndDate) {
      const trialEnd = new Date(subscription.trialEndDate);
      if (new Date() > trialEnd) {
        logWarn('subscription_check_trial_expired');
        return res.redirect('/subscription-required.html?from=' + (req.path.includes('overlay') ? 'overlay' : 'donate'));
      }
    }

    if (!isActive || !hasValidPlan) {
      logWarn('subscription_check_invalid_plan', { planType: subscription.planType, status: subscription.status });
      return res.redirect('/subscription-required.html?from=' + (req.path.includes('overlay') ? 'overlay' : 'donate'));
    }

    // Subscription is valid, allow access
    next();
  } catch (error) {
    logError('subscription_check_failed');
    return res.redirect('/subscription-required.html');
  }
}

// Multi-user overlay routes (with subscription check)
app.get('/overlay/:slug', requireActiveSubscription, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Legacy overlay route (backward compatibility - uses default workspace)
app.get('/overlay', requireActiveSubscription, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Multi-user donate routes (with subscription check)
app.get('/donate/:slug', requireActiveSubscription, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'donate.html'));
});

// Legacy donate route (backward compatibility - uses default workspace)
app.get('/donate', requireActiveSubscription, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'donate.html'));
});

// Success page - handle both GET (ClientBackURL) and POST (OrderResultURL)
app.get('/success', (req, res) => {
  // Handle sandbox mode parameter and workspace slug
  const { sandbox, slug } = req.query;
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (sandbox === '1') {
    logInfo('sandbox_success_redirect');
  }

  // Redirect to workspace-specific donate page if slug provided
  const redirectUrl = slug ? `/donate/${slug}?success=1` : '/donate?success=1';
  return res.redirect(redirectUrl);
});

app.post('/success', async (req, res) => {
  const p = req.body || {};

  // Extract workspace slug from CustomField3 (we pass it in /create-order)
  const workspaceSlug = p.CustomField3 || null;
  let workspace = null;

  if (workspaceSlug) {
    workspace = await database.getWorkspaceBySlug(workspaceSlug);
    logInfo('success_post_workspace_resolved_from_slug');
  }

  if (!workspace) {
    workspace = await getDefaultWorkspace();
    logInfo('success_post_using_default_workspace');
  }

  if (!workspace) {
    logError('success_post_workspace_not_found');
    return res.redirect(303, '/donate?error=1');
  }

  const credentials = await getECPayCredentials(workspace.id);
  const provider = await database.getPaymentProvider(workspace.id, 'ecpay');
  const ok = String(p.RtnCode) === '1' &&
    p.MerchantID === credentials.merchantId &&
    await verifyCheckMacValue(p, workspace.id, req.rawFormBody);

  if (ok) {
    // Safe fallback: add donation here too (idempotent via trade number)
    await addDonation(workspace.id, normalizeEcpayReturn(p, { providerRecordId: provider?.id }));
    const returnRevenueEvent = normalizeEcpayReturnRevenueEvent(p, {
      workspaceId: workspace.id,
      providerRecordId: provider?.id
    });
    if (returnRevenueEvent) {
      await database.addRevenueEvent(workspace.id, returnRevenueEvent);
    }
    logInfo('success_post_donation_added');

    // Redirect to workspace-specific donate page
    const redirectUrl = workspaceSlug ? `/donate/${workspaceSlug}?success=1` : '/donate?success=1';
    return res.redirect(303, redirectUrl);
  }

  logWarn('success_post_invalid_or_failed');
  const errorUrl = workspaceSlug ? `/donate/${workspaceSlug}?error=1` : '/donate?error=1';
  return res.redirect(303, errorUrl);
});

// =============================================
// ECPAY WEBHOOK ENDPOINT (Multi-User)
// =============================================
// For payment notifications from ECPay merchant backend
// Merchants can set this URL in ECPay's "付款完成通知回傳網址" (ReturnURL)

app.post('/webhook/:slug', async (req, res) => {
  logInfo('payment_webhook_received', { request_id: req.requestId, provider: 'ecpay' });

  try {
    const { slug } = req.params;
    const workspace = await database.getWorkspaceBySlug(slug);

    if (!workspace) {
      logWarn('payment_webhook_workspace_not_found', { request_id: req.requestId });
      return res.status(404).send('0|Workspace not found');
    }

    const credentials = await getECPayCredentials(workspace.id);
    const provider = await database.getPaymentProvider(workspace.id, 'ecpay');
    const payload = req.body || {};

    // Normalize types (ECPay often posts strings)
    const transCode = Number(payload.TransCode);
    const merchantIdOk = String(payload.MerchantID) === String(credentials.merchantId);

    if (!merchantIdOk) {
      logWarn('payment_webhook_invalid_merchant', { request_id: req.requestId });
      sendAlert('payment_webhook_invalid_merchant', { requestId: req.requestId, route: '/webhook/:slug', statusCode: 400 });
      broadcastAdminNotification(workspace.id, 'error', 'Webhook: Merchant ID 不符', {
        reason: 'invalid_merchant',
        hint: '請確認登入 ECPay 商店後台的帳號，與下方「ECPay 金流設定」填寫的商店代號 (MerchantID) 為同一個特店'
      });
      return res.status(400).send('0|Invalid merchant');
    }

    if (transCode !== 1) {
      logWarn('payment_webhook_transcode_rejected', { request_id: req.requestId });
      broadcastAdminNotification(workspace.id, 'warning', 'Webhook: TransCode 非 1', {
        transCode: payload.TransCode
      });
      return res.send('1|OK'); // Still acknowledge
    }

    // Verify ECPay's outer signature against the captured raw form bytes before
    // decrypting or trusting Data. No callback fields are added or normalized first.
    if (!await verifyCheckMacValue(payload, workspace.id, req.rawFormBody)) {
      logWarn('payment_webhook_invalid_signature', { request_id: req.requestId });
      sendAlert('payment_webhook_invalid_signature', { requestId: req.requestId, route: '/webhook/:slug', statusCode: 400 });
      broadcastAdminNotification(workspace.id, 'error', 'Webhook: CheckMacValue 驗證失敗', {
        reason: 'invalid_signature'
      });
      return res.status(400).send('0|Invalid checksum');
    }

    // Decrypt the Data field
    const decryptedData = await decryptECPayData(payload.Data, workspace.id);
    if (!decryptedData) {
      logWarn('payment_webhook_decryption_failed', { request_id: req.requestId });
      sendAlert('payment_webhook_decryption_failed', { requestId: req.requestId, route: '/webhook/:slug', statusCode: 400 });
      broadcastAdminNotification(workspace.id, 'error', 'Webhook: 無法解密 Data 欄位', {
        hint: '請確認 HashKey 和 HashIV 設定是否正確'
      });
      return res.status(400).send('0|Decryption failed');
    }


    // Check RtnCode (1 = API execution successful) - normalize to number
    if (Number(decryptedData.RtnCode) !== 1) {
      logWarn('payment_webhook_rtncode_not_success', { request_id: req.requestId });
      broadcastAdminNotification(workspace.id, 'warning', 'Webhook: RtnCode 非 1', {
        rtnCode: decryptedData.RtnCode,
        rtnMsg: decryptedData.RtnMsg
      });
      return res.send('1|OK'); // Still acknowledge
    }

    // Check if this is a simulated payment - normalize to number
    if (Number(decryptedData.SimulatePaid) === 1) {
      logInfo('payment_webhook_simulated', { request_id: req.requestId });
      broadcastAdminNotification(workspace.id, 'warning', 'Webhook: 這是模擬付款', {
        message: '此為測試交易，不會新增到資料庫'
      });
      return res.send('1|OK');
    }

    // Check trade status (1 = paid) - normalize to number
    const orderInfo = decryptedData.OrderInfo;
    if (Number(orderInfo.TradeStatus) !== 1) {
      logInfo('payment_webhook_not_paid', { request_id: req.requestId });
      broadcastAdminNotification(workspace.id, 'warning', 'Webhook: 交易尚未付款', {
        tradeStatus: orderInfo.TradeStatus
      });
      return res.send('1|OK');
    }

    const donationEvent = normalizeEcpayPaidDonation({
      orderInfo,
      decryptedData,
      providerRecordId: provider?.id
    });
    if (!donationEvent) return res.send('1|OK');
    const donationAdded = await addDonation(workspace.id, donationEvent);

    const revenueEvent = normalizeEcpayPaidRevenueEvent({
      workspaceId: workspace.id,
      orderInfo,
      decryptedData,
      providerRecordId: provider?.id
    });
    if (revenueEvent) {
      await database.addRevenueEvent(workspace.id, revenueEvent);
    }

    if (donationAdded) {
      logInfo('payment_webhook_donation_processed', { request_id: req.requestId });
    } else {
      logInfo('payment_webhook_duplicate', { request_id: req.requestId });
    }

    // Always return 1|OK to ECPay
    return res.send('1|OK');

  } catch (error) {
    logError('payment_webhook_unexpected_error', { request_id: req.requestId });
    sendAlert('payment_webhook_unexpected_error', { requestId: req.requestId, route: '/webhook/:slug', statusCode: 500 });
    return res.status(500).send('0|Server error');
  }
});

// =============================================
// AUTHENTICATION PAGES
// =============================================

// Login page (OAuth only)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Logout
app.post('/logout', requireSameOrigin, (req, res) => {
  const userId = 'authenticated';
  const userEmail = null;

  logInfo('logout_requested');

  req.session.destroy((err) => {
    if (err) {
      logError('session_destroy_failed');
    } else {
      logInfo('session_destroyed');
    }
    res.redirect('/login');
  });
});

// =============================================
// AUTHENTICATION API ROUTES (OAuth only)
// =============================================
// All password-based authentication has been removed.
// Users can only login via OAuth providers (Google, Twitch, GitHub, etc.)

// =============================================
// GOOGLE OAUTH ROUTES
// =============================================

// Rotate the session identifier after a successful OAuth exchange so an attacker
// cannot carry a pre-authentication session ID into an authenticated session.
function regenerateOAuthSession(req, res, next) {
  const user = req.user;
  if (!user || !req.session?.regenerate) return next(new Error('OAuth session unavailable'));
  req.session.regenerate(error => {
    if (error) return next(error);
    req.logIn(user, { session: true }, loginError => {
      if (loginError) return next(loginError);
      return next();
    });
  });
}

// Google OAuth - Initiate authentication
app.get('/api/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: true
  })
);

// Google OAuth - Callback
app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=oauth_failed', state: true }),
  regenerateOAuthSession,
  async (req, res) => {
    // Successful authentication - properly set session with user data
    req.session.userId = req.user.id;
    req.session.username = req.user.username;
    req.session.email = req.user.email;
    req.session.isAdmin = req.user.isAdmin || false;

    // Update last login time
    await database.updateUserLastLogin(req.user.id);

    logInfo('oauth_login_success');
    /* Session fields are intentionally not logged. */
    /*
      userId: req.session.userId,
      email: req.session.email,
      username: req.session.username,
      sessionID: req.sessionID
    }); */

    res.redirect('/admin');
  }
);

// Get user info and subscription (protected)
app.get('/api/user/info', requireAdmin, async (req, res) => {
  try {
    // Get user ID from session (fixed session management bug)
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'No user session found' });
    }

    const user = await database.findUserById(req.session.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get subscription
    const subscription = await database.getUserSubscription(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName
      },
      subscription: subscription || {
        planType: 'free',
        status: 'active',
        isTrial: false,
        maxDonationsPerMonth: 100,
        maxApiCallsPerDay: 1000
      }
    });
  } catch (error) {
    logError('user_info_fetch_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Get workspace URLs (protected) - returns user-specific URLs
app.get('/api/workspace/urls', requireAdmin, async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user's workspaces (returns array)
    const workspaces = await database.getUserWorkspaces(req.session.userId);

    if (!workspaces || workspaces.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Use the first workspace (users typically have one workspace)
    const workspace = workspaces[0];

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    res.json({
      success: true,
      urls: {
        overlay: `${baseUrl}${workspace.overlayUrl}`,
        donate: `${baseUrl}${workspace.donationUrl}`,
        webhook: `${baseUrl}${workspace.webhookUrl}`,
        genericWebhook: `${baseUrl}/api/webhook/generic/${workspace.slug}`,
        slug: workspace.slug
      }
    });
  } catch (error) {
    logError('workspace_urls_fetch_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to get workspace URLs' });
  }
});

// =============================================
// UNIVERSAL REVENUE EVENT CORE ROUTES
// =============================================

// Get active revenue sources and capabilities
app.get('/api/sources', (req, res) => {
  const sources = getActiveSources().map(s => ({
    id: s.id,
    name: s.name,
    type: s.type,
    description: s.description,
    capabilities: s.capabilities
  }));
  res.json({ status: 'success', sources });
});

// Generic Inbound Webhook (Token-Authenticated)
app.post('/api/webhook/generic/:slug', async (req, res) => {
  logInfo('generic_webhook_received', { request_id: req.requestId, slug: req.params.slug });

  try {
    const { slug } = req.params;
    const authToken = extractWebhookToken(req.headers);

    const result = await processGenericWebhook({
      slug,
      authToken,
      body: req.body,
      requestId: req.requestId,
      database
    });

    if (result.workspaceId && !result.wasDuplicate) {
      await broadcastProgress(result.workspaceId);
    }

    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    logError('generic_webhook_unexpected_error', { request_id: req.requestId });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current generic webhook token for workspace
app.get('/api/workspace/webhook-token', requireAdmin, async (req, res) => {
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    const token = await database.getGenericWebhookToken(workspace.id);
    return res.json({ status: 'success', token });
  } catch (error) {
    logError('get_webhook_token_failed', { request_id: req.requestId });
    return res.status(500).json({ error: 'Failed to retrieve webhook token' });
  }
});

// Rotate generic webhook token for workspace
app.post('/api/workspace/webhook-token/rotate', requireAdmin, requireSameOrigin, async (req, res) => {
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    const token = await database.rotateGenericWebhookToken(workspace.id);
    logInfo('webhook_token_rotated', { workspace_id: workspace.id });
    return res.json({ status: 'success', token });
  } catch (error) {
    logError('rotate_webhook_token_failed', { request_id: req.requestId });
    return res.status(500).json({ error: 'Failed to rotate webhook token' });
  }
});

// Create manual revenue event (authenticated creator)
app.post('/api/events/manual', requireAdmin, requireSameOrigin, async (req, res) => {
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const { amount, currency, quantity, type, supporter, message, metadata } = req.body || {};
    const event = createManualRevenueEvent({
      workspaceId: workspace.id,
      amountMinor: amount,
      currency,
      quantity,
      type,
      supporter,
      message,
      metadata
    });

    const result = await database.addRevenueEvent(workspace.id, event);
    await broadcastProgress(workspace.id);
    return res.status(201).json({ status: 'success', event: result.event });
  } catch (error) {
    logWarn('create_manual_event_failed', { error: error.message });
    return res.status(400).json({ error: error.message });
  }
});

// Create/trigger test revenue event (authenticated creator)
app.post('/api/events/test', requireAdmin, requireSameOrigin, async (req, res) => {
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const { amount, currency, quantity, type, supporter, message, externalId, persist = false } = req.body || {};
    const event = createTestRevenueEvent({
      workspaceId: workspace.id,
      amountMinor: amount !== undefined ? amount : 100,
      currency: currency || 'TWD',
      quantity,
      type: type || 'test',
      supporter: supporter || 'Tester',
      message: message || 'Test contribution',
      externalId: externalId || null
    });

    if (persist) {
      await database.addRevenueEvent(workspace.id, event);
      await broadcastProgress(workspace.id);
    } else {
      // Broadcast transient test event to OBS without corrupting totals
      await broadcastProgress(workspace.id, {
        externalId: event.id,
        amount: event.amount?.valueMinor ?? 0,
        payer: event.supporter?.displayName || 'Tester',
        message: event.message || ''
      });
    }

    return res.json({ status: 'success', event });
  } catch (error) {
    logWarn('create_test_event_failed', { error: error.message });
    return res.status(400).json({ error: error.message });
  }
});

// Query revenue event history (authenticated creator)
app.get('/api/events', requireAdmin, async (req, res) => {
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const { limit, offset, source, isSynthetic } = req.query;
    const events = await database.getWorkspaceRevenueEvents(workspace.id, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      source: source || null,
      isSynthetic: isSynthetic !== undefined ? (isSynthetic === 'true' || isSynthetic === '1') : null
    });

    return res.json({ status: 'success', events });
  } catch (error) {
    logError('get_events_history_failed', { request_id: req.requestId });
    return res.status(500).json({ error: 'Failed to retrieve events history' });
  }
});

// Get feedback (admin only)
app.get('/api/feedback', requireAdmin, requirePlatformAdmin, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const feedback = await database.getFeedback({
      status: status || null,
      limit: parseInt(limit)
    });
    res.json({ success: true, feedback });
  } catch (error) {
    logError('feedback_list_fetch_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

// Update feedback status (admin only)
app.patch('/api/feedback/:id', requireAdmin, requirePlatformAdmin, requireSameOrigin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['new', 'reviewing', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const feedback = await database.updateFeedbackStatus(id, status);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    logInfo('feedback_status_updated', { status });
    res.json({ success: true, feedback });
  } catch (error) {
    logError('feedback_status_update_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to update feedback status' });
  }
});

// Submit feedback (protected)
app.post('/api/feedback', requireAdmin, requireSameOrigin, async (req, res) => {
  try {
    const { type, message, email } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Store feedback in database - use logged-in user's ID, not default workspace
    const userId = req.session.userId;
    const feedback = await database.createFeedback({
      userId: userId,
      type: type || 'general',
      message: message,
      email: email || null,
      metadata: {
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    });

    logInfo('feedback_submitted', { type: feedback.type, messageLength: message.length });

    // Easter egg: secret free-pass activation 🎁 (docs/features/EASTER_EGG.md).
    // An upgrade failure must not fail the feedback submission itself.
    let easterEggActivated = false;
    try {
      easterEggActivated = await maybeActivateFreePass({
        database,
        userId,
        message,
        feedbackId: feedback.id
      });
      if (easterEggActivated) {
        logInfo('free_pass_granted', { source: 'easter_egg', request_id: req.requestId });
      }
    } catch (upgradeError) {
      logError('easter_egg_upgrade_failed', { request_id: req.requestId });
    }

    // Add regular audit log
    await database.addAuditLog({
      userId: userId,
      action: 'feedback.submitted',
      resourceType: 'feedback',
      resourceId: feedback.id,
      status: 'success',
      metadata: { type: feedback.type, messageLength: message.length }
    });

    // Return response with special message if easter egg activated
    res.json({
      success: true,
      message: easterEggActivated
        ? '🎉 恭喜！您已解鎖永久 Free Pass！感謝您的熱情支持！🎁'
        : 'Feedback submitted successfully',
      feedbackId: feedback.id,
      specialReward: easterEggActivated
    });
  } catch (error) {
    logError('feedback_submission_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Protected admin route
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ECPay client-side return for the initial subscription authorization. Payment
// state is changed only by /ecpay/return; this route is display/navigation only.
function subscriptionClientReturn(req, res) {
  const destination = req.session?.userId ? '/admin?subscription=success' : '/login?subscription=success';
  return res.redirect(303, destination);
}

app.get('/subscription/success', subscriptionClientReturn);
app.post('/subscription/success', subscriptionClientReturn);

// ECPay callback endpoint
app.post('/ecpay/return', async (req, res) => {
  const p = req.body;

  if (String(p?.MerchantID) === String(getBillingECPayCredentials().merchantId)) {
    try {
      const result = await processSubscriptionPaymentCallback(p, req.rawFormBody);
      return res.status(result.status || 200).send(result.ok ? '1|OK' : result.message);
    } catch (error) {
      logError('subscription_initial_callback_failed', { request_id: req.requestId });
      sendAlert('subscription_initial_callback_failed', { requestId: req.requestId, route: '/ecpay/return', statusCode: 500 });
      return res.status(500).send('0|Server error');
    }
  }

  // Extract workspace slug from CustomField3
  const workspaceSlug = p.CustomField3 || null;
  let workspace = null;

  if (workspaceSlug) {
    workspace = await database.getWorkspaceBySlug(workspaceSlug);
    logInfo('ecpay_return_workspace_resolved_from_slug');
  }

  if (!workspace) {
    workspace = await getDefaultWorkspace();
    logInfo('ecpay_return_using_default_workspace');
  }

  if (!workspace) {
    logError('ecpay_return_workspace_not_found');
    return res.status(400).send('0|FAIL');
  }

  const credentials = await getECPayCredentials(workspace.id);
  const provider = await database.getPaymentProvider(workspace.id, 'ecpay');
  const validMac = await verifyCheckMacValue(p, workspace.id, req.rawFormBody);
  const success = p.RtnCode === '1';
  const mine = p.MerchantID === credentials.merchantId;

  if (validMac && success && mine) {
    await addDonation(workspace.id, normalizeEcpayReturn(p, { providerRecordId: provider?.id }));
    const returnRevenueEvent = normalizeEcpayReturnRevenueEvent(p, {
      workspaceId: workspace.id,
      providerRecordId: provider?.id
    });
    if (returnRevenueEvent) {
      await database.addRevenueEvent(workspace.id, returnRevenueEvent);
    }
    logInfo('ecpay_return_donation_added');
    return res.send('1|OK');
  }

  logWarn('ecpay_return_verification_failed', { success, validMac, mine });
  return res.status(400).send('0|FAIL');
});

// ECPay Webhook endpoint - For payment notifications from ECPay merchant backend
// Merchants can set this URL in ECPay's "付款完成通知回傳網址" (ReturnURL)
// Reference: https://developers.ecpay.com.tw/?p=41030
// Multi-user: Use /webhook/:slug for workspace-specific webhooks
function requirePlatformAdmin(req, res, next) {
  if (req.session?.userId && req.session?.isAdmin === true) return next();
  return res.status(403).json({ error: 'Forbidden' });
}

function escapeHtmlAttribute(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Create ECPay order - supports slug in request body for multi-user
app.post('/create-order', requireSameOrigin, async (req, res) => {
  const { amount, nickname, message, slug } = req.body;

  const amountText = String(amount ?? '').trim();
  const amt = /^\d{1,7}$/.test(amountText) ? Number(amountText) : NaN;
  const normalizedNickname = String(nickname || '匿名').trim().slice(0, 80) || '匿名';
  const normalizedMessage = String(message || '').trim().slice(0, 300);
  const normalizedSlug = String(slug || '').trim();
  if (!Number.isSafeInteger(amt) || amt < 1 || amt > 1_000_000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (normalizedSlug && !/^[a-z0-9-]{1,100}$/.test(normalizedSlug)) return res.status(400).json({ error: 'Invalid workspace' });

  const tradeNo = createDonationTradeNo();
  const tradeDate = formatECPayDate(new Date());     // 正確格式

  // Sandbox mode: simulate successful payment without ECPay API
  if (process.env.ENVIRONMENT === 'sandbox') {
    logInfo('sandbox_payment_simulation_started');

    // Get workspace from slug or use default
    const workspace = await getWorkspaceFromSlug(normalizedSlug);

    if (!workspace) {
      logWarn('sandbox_workspace_not_found');
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const provider = await database.getPaymentProvider(workspace.id, 'ecpay');

    // Add donation directly to database (simulate successful payment)
    const success = await addDonation(workspace.id, createTestDonationEvent({
      externalId: tradeNo,
      amount: amt,
      payer: normalizedNickname,
      message: normalizedMessage,
      providerRecordId: provider?.id
    }));

    if (success) {
      logInfo('sandbox_payment_simulation_succeeded');
      const redirectUrl = normalizedSlug ? `/success?sandbox=1&slug=${normalizedSlug}` : '/success?sandbox=1';
      return res.redirect(redirectUrl);
    } else {
      logInfo('sandbox_payment_simulation_duplicate');
      const errorUrl = normalizedSlug ? `/donate/${normalizedSlug}?error=1` : '/donate?error=1';
      return res.redirect(errorUrl);
    }
  }

  // Production mode: redirect to actual ECPay
  const workspace = await getWorkspaceFromSlug(normalizedSlug);

  if (!workspace) {
    logWarn('create_order_workspace_not_found');
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const credentials = await getECPayCredentials(workspace.id);
  const params = {
    MerchantID: credentials.merchantId,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: String(amt),            // 整數字串
    TradeDesc: 'Stream Donation',
    ItemName: 'Stream Support x1',
    ReturnURL: `${process.env.BASE_URL}/ecpay/return`,
    ClientBackURL: `${process.env.BASE_URL}/success${normalizedSlug ? `?slug=${encodeURIComponent(normalizedSlug)}` : ''}`,
    OrderResultURL: `${process.env.BASE_URL}/success`,
    ChoosePayment: 'Credit',
    EncryptType: 1,
    CustomField1: normalizedNickname,
    CustomField2: normalizedMessage,
    CustomField3: workspace.slug  // Pass workspace slug for return callback
  };

  // 產生簽章（最後再放入）
  params.CheckMacValue = await generateCheckMacValue(params, workspace.id);

  // Create auto-submit form
  const action = getECPayCheckoutUrl();

  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtmlAttribute(k)}" value="${escapeHtmlAttribute(v)}">`)
    .join('\n');

  res.send(`
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>Redirecting…</title></head>
    <body onload="document.forms[0].submit()">
      <form method="post" action="${action}">
        ${inputs}
      </form>
      <p style="font-family:system-ui">Redirecting to ECPay…</p>
    </body></html>
  `);
});

// Admin API - Get progress for logged-in user's workspace
app.get('/admin/progress', requireAdmin, async (req, res) => {
  try {
    const workspace = await getUserWorkspaceFromSession(req);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    logInfo('admin_progress_requested');

    const progress = await getProgress(workspace.id);
    res.json(progress);
  } catch (error) {
    logError('admin_progress_fetch_failed', { request_id: req.requestId });
    res.status(500).json({
      error: 'Failed to load progress',
      title: '斗內目標',
      current: 0,
      goal: 1000,
      percent: 0,
      donations: []
    });
  }
});

// Guided activation checklist: provider configured, OBS connected, first donation,
// live alert. See ROADMAP.md P1 "Guided activation" and activation.js for the
// (heuristic, documented) definition of each step.
app.get('/admin/activation', requireAdmin, async (req, res) => {
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const [provider, settings] = await Promise.all([
      database.getPaymentProvider(workspace.id, 'ecpay'),
      database.getWorkspaceSettings(workspace.id)
    ]);

    const steps = computeActivationSteps({ provider, settings });
    res.json({ steps });
  } catch (error) {
    logError('admin_activation_fetch_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'internal_error' });
  }
});

// Send a non-persistent canonical test event through the real SSE/OBS path.
// This is deliberately unavailable in production so it cannot be mistaken for
// a payment or alter first-donation activation evidence.
app.post('/admin/activation/test-alert', requireAdmin, requireSameOrigin, async (req, res) => {
  if (production) return res.status(404).json({ error: 'not_available' });

  try {
    const workspace = await getUserWorkspaceFromSession(req);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const externalId = `activation-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    const donationEvent = createTestDonationEvent({
      externalId,
      amount: 100,
      payer: '測試觀眾',
      message: '這是 OBS 測試提示'
    });
    await broadcastProgress(workspace.id, donationEvent);
    logInfo('activation_test_alert_broadcast');
    res.json({ success: true });
  } catch (error) {
    logError('activation_test_alert_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'internal_error' });
  }
});

// Aggregate activation funnel data is available only to a platform administrator. It
// deliberately returns counts and median durations, never tenant-level event records.
app.get('/admin/platform/activation-funnel', requirePlatformAdmin, async (req, res) => {
  try {
    res.json({ funnel: await database.getActivationFunnelMetrics() });
  } catch (error) {
    logError('platform_activation_funnel_fetch_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'internal_error' });
  }
});

// Admin API for goal management (protected routes)
app.post('/admin/goal', requireAdmin, requireSameOrigin, async (req, res) => {
  logInfo('admin_goal_update_requested');
  try {
    const { title, amount, startFrom } = req.body;
    const workspace = await getUserWorkspaceFromSession(req);

    const normalizedTitle = String(title || '').trim().slice(0, 200);
    const amountText = String(amount ?? '').trim();
    const startText = String(startFrom ?? '0').trim();
    const normalizedAmount = /^\d{1,10}$/.test(amountText) ? Number(amountText) : NaN;
    const normalizedStart = /^\d{1,10}$/.test(startText) ? Number(startText) : NaN;
    if (!normalizedTitle || !Number.isSafeInteger(normalizedAmount) || normalizedAmount < 1 || normalizedAmount > 1_000_000_000 || !Number.isSafeInteger(normalizedStart) || normalizedStart < 0 || normalizedStart > 1_000_000_000) {
      return res.status(400).json({ success: false, error: 'Invalid goal values' });
    }

    if (!workspace) {
      logWarn('admin_goal_update_workspace_not_found');
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    logInfo('admin_goal_update_validated');

    await database.updateWorkspaceSettings(workspace.id, {
      goalTitle: normalizedTitle,
      goalAmount: normalizedAmount,
      goalStartFrom: normalizedStart
    });

    logInfo('admin_goal_update_persisted');

    // Broadcast progress update (with error handling)
    await broadcastProgress(workspace.id);

    const settings = await database.getWorkspaceSettings(workspace.id);
    const response = {
      success: true,
      goal: {
        title: settings.goalTitle,
        amount: settings.goalAmount,
        startFrom: settings.goalStartFrom
      }
    };

    logInfo('admin_goal_update_completed');
    res.json(response);
  } catch (error) {
    logError('admin_goal_update_failed', { request_id: req.requestId });
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.post('/admin/reset', requireAdmin, requireSameOrigin, async (req, res) => {
  try {
    const workspace = await getUserWorkspaceFromSession(req);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    await database.clearWorkspaceDonations(workspace.id);
    await broadcastProgress(workspace.id);
    res.json({ success: true });
  } catch (error) {
    logError('admin_reset_failed', { request_id: req.requestId });
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// ECPay credentials management
app.get('/admin/ecpay', requireAdmin, async (req, res) => {
  logInfo('admin_ecpay_credentials_requested');
  try {
    const workspace = await getUserWorkspaceFromSession(req);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const credentials = await getECPayCredentials(workspace.id);
    const sharedMerchantId = credentials.merchantId
      ? await database.isEcpayMerchantIdSharedWithOtherWorkspace(workspace.id, credentials.merchantId)
      : false;
    res.json({
      merchantId: credentials.merchantId || '',
      hashKey: credentials.hashKey ? '••••••••' : '',
      hashIV: credentials.hashIV ? '••••••••' : '',
      sharedMerchantId
    });
  } catch (error) {
    logError('admin_ecpay_credentials_fetch_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/admin/ecpay', requireAdmin, requireSameOrigin, async (req, res) => {
  try {
    const { merchantId, hashKey, hashIV } = req.body;

    if (!merchantId && !hashKey && !hashIV) {
      return res.status(400).json({ error: '請至少填寫商店代號、HashKey 或 HashIV 其中一項' });
    }
    const normalizedMerchantId = merchantId ? String(merchantId).trim() : '';
    const normalizedHashKey = hashKey ? String(hashKey).trim() : '';
    const normalizedHashIV = hashIV ? String(hashIV).trim() : '';
    if (normalizedMerchantId && !/^[A-Za-z0-9]{1,20}$/.test(normalizedMerchantId)) {
      return res.status(400).json({ error: '商店代號 (MerchantID) 格式不符：應為 1-20 碼英數字，請確認貼上時沒有多餘空格' });
    }
    if (normalizedHashKey && !/^[A-Za-z0-9]{8,128}$/.test(normalizedHashKey)) {
      return res.status(400).json({ error: 'HashKey 格式不符：應為 8-128 碼英數字，請確認沒有貼錯欄位或多餘空格' });
    }
    if (normalizedHashIV && !/^[A-Za-z0-9]{8,128}$/.test(normalizedHashIV)) {
      return res.status(400).json({ error: 'HashIV 格式不符：應為 8-128 碼英數字，請確認沒有貼錯欄位或多餘空格' });
    }

    const workspace = await getUserWorkspaceFromSession(req);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const existing = await database.getPaymentProvider(workspace.id, 'ecpay');

    // Prepare update data
    const updateData = {
      providerName: 'ecpay',
      merchantId: normalizedMerchantId || existing?.merchantId,
      hashKey: normalizedHashKey || existing?.hashKey,
      hashIV: normalizedHashIV || existing?.hashIV,
      isActive: true
    };

    const provider = await database.upsertPaymentProvider(workspace.id, updateData);
    if (provider.merchantId && provider.hashKey && provider.hashIV) {
      await database.markWorkspaceProviderConfigured(workspace.id);
    }

    res.json({ success: true, message: 'ECPay credentials updated successfully' });
  } catch (error) {
    logError('admin_ecpay_credentials_update_failed', { request_id: req.requestId });
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// Overlay settings management
app.get('/admin/overlay', requireAdmin, async (req, res) => {
  logInfo('admin_overlay_settings_requested');
  try {
    const workspace = await getUserWorkspaceFromSession(req);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const settings = await database.getWorkspaceSettings(workspace.id);
    res.json(settings?.overlaySettings || {});
  } catch (error) {
    logError('admin_overlay_settings_fetch_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/admin/overlay', requireAdmin, requireSameOrigin, async (req, res) => {
  try {
    const settings = req.body;
    const workspace = await getUserWorkspaceFromSession(req);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const currentSettings = await database.getWorkspaceSettings(workspace.id);

    // Validate and sanitize settings
    const overlaySettings = currentSettings?.overlaySettings || {};

    // Update settings with validation
    if (typeof settings.showDonationAlert === 'boolean') {
      overlaySettings.showDonationAlert = settings.showDonationAlert;
    }
    if (typeof settings.fontSize === 'number' && settings.fontSize > 0) {
      overlaySettings.fontSize = Math.max(10, Math.min(50, settings.fontSize));
    }
    if (typeof settings.fontColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(settings.fontColor)) {
      overlaySettings.fontColor = settings.fontColor;
    }
    if (typeof settings.backgroundColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(settings.backgroundColor)) {
      overlaySettings.backgroundColor = settings.backgroundColor;
    }
    if (typeof settings.progressBarColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(settings.progressBarColor)) {
      overlaySettings.progressBarColor = settings.progressBarColor;
    }
    if (typeof settings.progressBarHeight === 'number' && settings.progressBarHeight > 0) {
      overlaySettings.progressBarHeight = Math.max(10, Math.min(100, settings.progressBarHeight));
    }
    if (typeof settings.progressBarCornerRadius === 'number' && settings.progressBarCornerRadius >= 0) {
      overlaySettings.progressBarCornerRadius = Math.max(0, Math.min(50, settings.progressBarCornerRadius));
    }
    if (typeof settings.alertDuration === 'number' && settings.alertDuration > 0) {
      overlaySettings.alertDuration = Math.max(1000, Math.min(30000, settings.alertDuration));
    }
    if (typeof settings.position === 'string') {
      const validPositions = ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'];
      if (validPositions.includes(settings.position)) {
        overlaySettings.position = settings.position;
      }
    }
    if (typeof settings.width === 'number' && settings.width > 0) {
      overlaySettings.width = Math.max(300, Math.min(1920, settings.width));
    }
    if (typeof settings.alertEnabled === 'boolean') {
      overlaySettings.alertEnabled = settings.alertEnabled;
    }
    if (typeof settings.alertSound === 'boolean') {
      overlaySettings.alertSound = settings.alertSound;
    }
    if (typeof settings.alertSoundVolume === 'number') {
      overlaySettings.alertSoundVolume = Math.max(0, Math.min(100, settings.alertSoundVolume));
    }
    if (typeof settings.alertVoiceEnabled === 'boolean') {
      overlaySettings.alertVoiceEnabled = settings.alertVoiceEnabled;
    }
    if (typeof settings.alertVoiceVolume === 'number') {
      overlaySettings.alertVoiceVolume = Math.max(0, Math.min(100, settings.alertVoiceVolume));
    }
    if (typeof settings.donationDisplayMode === 'string') {
      const validModes = ['top', 'latest', 'hidden'];
      if (validModes.includes(settings.donationDisplayMode)) {
        overlaySettings.donationDisplayMode = settings.donationDisplayMode;
      }
    }
    if (typeof settings.donationDisplayCount === 'number' && settings.donationDisplayCount > 0) {
      overlaySettings.donationDisplayCount = Math.max(1, Math.min(10, settings.donationDisplayCount));
    }

    // Update in database
    await database.updateWorkspaceSettings(workspace.id, { overlaySettings });

    // Broadcast settings update to all connected overlays
    await broadcastOverlaySettings(workspace.id);

    res.json({ success: true, message: 'Overlay settings updated successfully', settings: overlaySettings });
  } catch (error) {
    logError('admin_overlay_settings_update_failed', { request_id: req.requestId });
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// Shared handler for the 3 media-upload routes below: validates a base64 data URL (or
// clears the field when dataUrl is empty/null, used by the admin UI's "revert to
// default" buttons), then read-modify-writes it into the workspace's overlaySettings.
async function handleMediaUpload(req, res, { bodyKey, settingsKey, validate, broadcast, failureEvent }) {
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    let validated;
    try {
      validated = validate(req.body?.[bodyKey]);
    } catch (validationError) {
      return res.status(400).json({ success: false, error: validationError.message });
    }

    const currentSettings = await database.getWorkspaceSettings(workspace.id);
    const overlaySettings = currentSettings?.overlaySettings || {};
    if (validated) {
      overlaySettings[settingsKey] = validated;
    } else {
      delete overlaySettings[settingsKey];
    }
    await database.updateWorkspaceSettings(workspace.id, { overlaySettings });

    if (broadcast) {
      await broadcastOverlaySettings(workspace.id);
    }

    res.json({ success: true, [settingsKey]: overlaySettings[settingsKey] || null });
  } catch (error) {
    logError(failureEvent, { request_id: req.requestId });
    res.status(500).json({ success: false, error: 'internal_error' });
  }
}

// Donation page banner image (rendered on /donate/:slug, not the OBS overlay).
app.post('/admin/donation-banner', requireAdmin, requireSameOrigin, async (req, res) => {
  await handleMediaUpload(req, res, {
    bodyKey: 'imageDataUrl',
    settingsKey: 'donationBannerImage',
    validate: (value) => validateImageDataUrl(value, { maxBytes: MAX_MEDIA_BYTES }),
    broadcast: false,
    failureEvent: 'admin_donation_banner_update_failed'
  });
});

// Custom image shown inside the OBS donation-alert popup.
app.post('/admin/alert-image', requireAdmin, requireSameOrigin, async (req, res) => {
  await handleMediaUpload(req, res, {
    bodyKey: 'imageDataUrl',
    settingsKey: 'alertImage',
    validate: (value) => validateImageDataUrl(value, { maxBytes: MAX_MEDIA_BYTES }),
    broadcast: true,
    failureEvent: 'admin_alert_image_update_failed'
  });
});

// Custom sound effect played when the OBS donation-alert popup shows.
app.post('/admin/alert-sound', requireAdmin, requireSameOrigin, async (req, res) => {
  await handleMediaUpload(req, res, {
    bodyKey: 'audioDataUrl',
    settingsKey: 'alertCustomSound',
    validate: (value) => validateAudioDataUrl(value, { maxBytes: MAX_MEDIA_BYTES }),
    broadcast: true,
    failureEvent: 'admin_alert_sound_update_failed'
  });
});

// Overlay settings endpoint for overlay.html - supports slug query parameter
app.get('/overlay-settings', requireActiveSubscription, async (req, res) => {
  try {
    const { slug } = req.query;
    const workspace = await getWorkspaceFromSlug(slug);
    const settings = await database.getWorkspaceSettings(workspace?.id);
    res.json(forOverlayClient(settings?.overlaySettings));
  } catch (error) {
    logError('overlay_settings_fetch_failed', { request_id: req.requestId });
    res.json({});
  }
});

// Database schema endpoint (for debugging and documentation)
app.get('/api/schema', requirePlatformAdmin, async (req, res) => {
  try {
    const queryActual = req.query.actual === 'true';
    const schema = await database.getDatabaseSchema(queryActual);
    res.json({
      success: true,
      schema,
      usage: {
        description: 'Database schema and relationships',
        queryActual: 'Add ?actual=true to query actual PostgreSQL schema (only works if connected)',
        example: '/api/schema?actual=true'
      }
    });
  } catch (error) {
    logError('schema_fetch_failed', { request_id: req.requestId });
    res.status(500).json({
      success: false,
      error: 'internal_error'
    });
  }
});

// =============================================
// SUBSCRIPTION ENDPOINTS (Week 1-2 Implementation)
// =============================================

/**
 * POST /subscription/checkout
 * Create ECPay periodic payment (subscription)
 * This initiates a recurring payment authorization
 */
app.post('/subscription/checkout', requireAuth, requireSameOrigin, async (req, res) => {
  try {
    const user = await database.findUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user already has an active subscription
    const existingSubscription = await database.getUserSubscription(user.id);
    if (existingSubscription && existingSubscription.status === 'active' && !existingSubscription.isTrial) {
      return res.status(400).json({ error: 'User already has an active subscription' });
    }

    // Get user's workspace
    const workspaces = await database.getUserWorkspaces(user.id);
    const workspace = workspaces[0];
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const credentials = getBillingECPayCredentials();

    // Subscription parameters
    const monthlyPrice = getSubscriptionPlan().monthlyPrice;
    const tradeNo = createSubscriptionTradeNo();
    const tradeDate = formatECPayDate(new Date());

    // ECPay Periodic Payment Parameters (based on official docs)
    const params = {
      MerchantID: credentials.merchantId,
      MerchantTradeNo: tradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: String(monthlyPrice),
      TradeDesc: 'Subscription Service',
      ItemName: 'Monthly Subscription x1',
      ReturnURL: `${process.env.BASE_URL}/ecpay/return`,
      OrderResultURL: `${process.env.BASE_URL}/subscription/success`,
      ChoosePayment: 'Credit',
      EncryptType: 1,

      // Periodic payment specific parameters
      PeriodAmount: String(monthlyPrice),    // Amount for each period
      PeriodType: 'M',                        // M = Monthly
      Frequency: 1,                            // Every 1 month
      ExecTimes: 999,                          // Maximum times (999 = until cancelled)
      PeriodReturnURL: `${process.env.BASE_URL}/ecpay/period/callback`,

      // Custom fields to track user and subscription
      CustomField1: user.id,
      CustomField2: workspace.id,
      CustomField3: existingSubscription?.id || 'new',
      CustomField4: 'donationbar_subscription'
    };

    // Generate CheckMacValue
    params.CheckMacValue = generateCheckMacValueWithCredentials(params, credentials);

    logInfo('subscription_checkout_started');
    logInfo('subscription_checkout_params_prepared', { periodType: params.PeriodType, frequency: params.Frequency });

    // Update or create subscription record
    if (existingSubscription) {
      await database.updateSubscription(user.id, {
        ecpayMerchantTradeNo: tradeNo,
        pricePerMonth: monthlyPrice
      });
    } else {
      await database.createSubscription(user.id, {
        planType: 'pro',
        status: 'pending',
        pricePerMonth: monthlyPrice,
        isTrial: false,
        ecpayMerchantTradeNo: tradeNo
      });
    }

    // Create auto-submit form HTML
    const action = getECPayCheckoutUrl();
    const inputs = Object.entries(params)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v)}">`)
      .join('\n');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Redirecting to Payment...</title>
        <style>
          body { font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
          .container { text-align: center; }
          .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body onload="document.forms[0].submit()">
        <div class="container">
          <div class="spinner"></div>
          <p>Redirecting to ECPay payment page...</p>
          <p style="font-size: 12px; color: #666;">Please do not close this window</p>
        </div>
        <form method="post" action="${action}">
          ${inputs}
        </form>
      </body>
      </html>
    `);
  } catch (error) {
    logError('subscription_checkout_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * POST /ecpay/period/callback
 * ⚠️ CRITICAL ENDPOINT - Receives monthly recurring payment notifications
 * Called by ECPay from 2nd payment onwards
 * MUST respond with "1|OK"
 */
app.post('/ecpay/period/callback', async (req, res) => {
  try {
    const result = await processSubscriptionPaymentCallback(req.body || {}, req.rawFormBody);
    return res.status(result.status || 200).send(result.ok ? '1|OK' : result.message);
  } catch (error) {
    logError('subscription_callback_unexpected_error', { request_id: req.requestId });
    sendAlert('subscription_callback_unexpected_error', { requestId: req.requestId, route: '/ecpay/period/callback', statusCode: 500 });
    return res.status(500).send('0|Server error');
  }
});

// Retained temporarily for reference while migrating old encrypted callback deployments.
// This route is intentionally unreachable by ECPay and must be removed after migration verification.
/**
 * GET /api/subscription/payment-history
 * Get payment history for logged-in user
 */
app.get('/api/subscription/payment-history', requireAuth, async (req, res) => {
  try {
    const user = await database.findUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const limit = parseInt(req.query.limit) || 50;
    const paymentHistory = await database.getUserPaymentHistory(user.id, limit);

    res.json({
      success: true,
      payments: paymentHistory.map(p => ({
        id: p.id,
        date: p.paidAt || p.createdAt,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        paymentMethod: `${p.paymentMethodType || 'Credit Card'} ${p.cardLast4 ? '****' + p.cardLast4 : ''}`.trim(),
        ecpayTradeNo: p.ecpayTradeNo,
        invoiceNumber: p.invoiceNumber,
        invoiceUrl: p.invoiceUrl
      }))
    });
  } catch (error) {
    logError('payment_history_fetch_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to retrieve payment history' });
  }
});

/**
 * POST /subscription/cancel
 * Cancel user's subscription
 */
app.post('/subscription/cancel', requireAuth, requireSameOrigin, async (req, res) => {
  try {
    const user = await database.findUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const subscription = await database.getUserSubscription(user.id);
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (subscription.status === 'cancelled') {
      return res.status(400).json({ error: 'Subscription already cancelled' });
    }

    if (!subscription.ecpayMerchantTradeNo) {
      return res.status(409).json({ error: 'Subscription has no ECPay recurring agreement to cancel' });
    }

    await cancelECPaySubscription(subscription.ecpayMerchantTradeNo);

    // Calculate grace period (until end of current billing cycle)
    const gracePeriodEnd = subscription.nextBillingDate || new Date();

    await database.updateSubscription(user.id, {
      status: 'cancelled',
      canceledAt: new Date(),
      gracePeriodEndAt: gracePeriodEnd
    });

    // Log audit trail
    await database.addAuditLog({
      userId: user.id,
      action: 'subscription_cancelled',
      resourceType: 'subscription',
      resourceId: subscription.id,
      status: 'success',
      metadata: { gracePeriodEnd }
    });

    logInfo('subscription_cancelled');

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      gracePeriodEnd
    });

    // Optional: send a cancellation confirmation email when SMTP is configured.
  } catch (error) {
    logError('subscription_cancel_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /subscription/pause
 * Pause user's subscription temporarily
 */
app.post('/subscription/pause', requireAuth, requireSameOrigin, async (req, res) => {
  return res.status(409).json({ error: 'ECPay does not support safely pausing this recurring plan. Cancel it instead to stop future charges.' });
  /* Legacy local-only pause logic retained temporarily for migration reference.
  try {
    const user = await database.findUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const subscription = await database.getUserSubscription(user.id);
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (subscription.status !== 'active') {
      return res.status(400).json({ error: 'Can only pause active subscriptions' });
    }

    await database.updateSubscription(user.id, {
      status: 'paused',
      pausedAt: new Date()
    });

    // Log audit trail
    await database.addAuditLog({
      userId: user.id,
      action: 'subscription_paused',
      resourceType: 'subscription',
      resourceId: subscription.id,
      status: 'success'
    });

    console.log('Subscription paused');

    res.json({
      success: true,
      message: 'Subscription paused successfully'
    });

    // Pause is not supported by ECPay; this block is unreachable.
  } catch (error) {
    console.error('❌ Pause subscription error:', error);
    res.status(500).json({ error: 'Failed to pause subscription' });
  }
  */
});

/**
 * POST /subscription/resume
 * Resume a paused subscription
 */
app.post('/subscription/resume', requireAuth, requireSameOrigin, async (req, res) => {
  try {
    const user = await database.findUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const subscription = await database.getUserSubscription(user.id);
    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    if (subscription.status !== 'paused') {
      return res.status(400).json({ error: 'Subscription is not paused' });
    }

    await database.updateSubscription(user.id, {
      status: 'active',
      pausedAt: null
    });

    // Log audit trail
    await database.addAuditLog({
      userId: user.id,
      action: 'subscription_resumed',
      resourceType: 'subscription',
      resourceId: subscription.id,
      status: 'success'
    });

    logInfo('subscription_resumed');

    res.json({
      success: true,
      message: 'Subscription resumed successfully'
    });
  } catch (error) {
    logError('subscription_resume_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to resume subscription' });
  }
});

/**
 * GET /api/subscription/status
 * Get current subscription status for logged-in user
 */
app.get('/api/subscription/status', requireAuth, async (req, res) => {
  try {
    const user = await database.findUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const subscription = await database.getUserSubscription(user.id);

    if (!subscription) {
      return res.json({
        hasSubscription: false,
        status: 'none'
      });
    }

    res.json({
      hasSubscription: true,
      subscription: {
        id: subscription.id,
        planType: subscription.planType,
        status: subscription.status,
        pricePerMonth: subscription.pricePerMonth,
        currency: subscription.currency,
        isTrial: subscription.isTrial,
        trialEndDate: subscription.trialEndDate,
        billingCycleStart: subscription.billingCycleStart,
        nextBillingDate: subscription.nextBillingDate,
        lastPaymentDate: subscription.lastPaymentDate,
        lastPaymentStatus: subscription.lastPaymentStatus,
        failedPaymentCount: subscription.failedPaymentCount,
        gracePeriodEndAt: subscription.gracePeriodEndAt,
        pausedAt: subscription.pausedAt,
        canceledAt: subscription.canceledAt,
        createdAt: subscription.createdAt
      }
    });
  } catch (error) {
    logError('subscription_status_fetch_failed', { request_id: req.requestId });
    res.status(500).json({ error: 'Failed to retrieve subscription status' });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const route = req.path?.startsWith('/webhook/') ? '/webhook/:slug' : req.path?.startsWith('/api/') ? '/api/*' : '/other';
  logError('http_unhandled_error', { request_id: req.requestId, route });
  sendAlert('http_unhandled_error', { requestId: req.requestId, route, statusCode: 500 });
  return res.status(500).json({ error: 'Internal server error', requestId: req.requestId });
});

// Start server
const port = process.env.PORT || 3000;
await database.ready;
const server = app.listen(port, () => {
  console.log(`🚀 DonationBar server running on port ${port}`);
  console.log(`📊 Overlay URL: http://localhost:${port}/overlay`);
  console.log(`💰 Donation page: http://localhost:${port}/donate`);
  console.log(`⚙️  Admin panel: http://localhost:${port}/admin`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo('shutdown_initiated', { signal });
  for (const client of sseClients.keys()) client.end();
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  server.close(async error => {
    try {
      await database.close();
      clearTimeout(forceExit);
      process.exit(error ? 1 : 0);
    } catch (closeError) {
      logError('shutdown_failed');
      process.exit(1);
    }
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
