import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import database from './database.js';
import * as emailService from './email.js';

const app = express();
const __dirname = path.resolve();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

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
            console.warn(`⚠️ Trial abuse detected: fingerprint ${fingerprint} already used`);
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
            
            console.log(`🚨 User ${user.email} created WITHOUT trial (abuse prevention)`);
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

          console.log(`✅ New user created via Google OAuth: ${user.email}`);
        } else {
          // Existing user - check if they have a workspace
          console.log(`ℹ️ Existing user logging in: ${user.email}`);
          
          const userWorkspaces = await database.getUserWorkspaces(user.id);
          if (!userWorkspaces || userWorkspaces.length === 0) {
            console.log(`⚠️ User ${user.email} has no workspace, creating one...`);
            
            // Check if any workspaces exist in the system
            const allWorkspaces = await database.getAllWorkspaces();
            const isFirstWorkspace = allWorkspaces.length === 0;
            
            // Create workspace for existing user
            await database.createWorkspace(user.id, {
              workspaceName: isFirstWorkspace ? 'Default Workspace' : `${user.displayName || user.username}'s Workspace`,
              slug: isFirstWorkspace ? 'default' : user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')
            });
            
            console.log(`✅ Workspace created for existing user: ${user.email}`);
          }
        }

        return done(null, user);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return done(error, null);
      }
    }
  ));
  console.log('✅ Google OAuth strategy configured');
} else {
  console.log('⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
}

const DB_PATH = path.join(__dirname, 'db.json');
const DEFAULT_WORKSPACE_SLUG = 'default';

// Helper: Get default workspace (for backward compatibility)
async function getDefaultWorkspace() {
  const workspace = await database.getWorkspaceBySlug(DEFAULT_WORKSPACE_SLUG);
  if (!workspace) {
    console.warn('⚠️  No default workspace found. Will be created when first user signs up.');
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
    console.error('❌ No user session found');
    return null;
  }
  
  console.log('🔍 Getting workspace for user:', req.session.userId);
  
  const workspaces = await database.getUserWorkspaces(req.session.userId);
  
  if (!workspaces || workspaces.length === 0) {
    console.error('❌ No workspace found for user:', req.session.userId);
    return null;
  }
  
  console.log('✅ Found workspace:', workspaces[0].id, workspaces[0].slug);
  
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
    console.log('💾 ECPay credentials migrated from .env to database');
    return envCredentials;
  }
  
  return envCredentials;
}

// SSE: Server-Sent Events for real-time updates
// Store clients with their workspace IDs: Map<Response, workspaceId>
const sseClients = new Map();

async function broadcastProgress(workspaceId = null) {
  try {
    if (!workspaceId) {
      const workspace = await getDefaultWorkspace();
      if (!workspace) {
        console.warn('⚠️ No workspace provided and no default workspace found');
        return;
      }
      workspaceId = workspace.id;
    }
    
    const data = await getProgress(workspaceId);
    if (!data) {
      console.error('❌ Failed to get progress data for workspace:', workspaceId);
      return;
    }
    
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    
    // Only broadcast to clients watching this specific workspace
    let successCount = 0;
    let errorCount = 0;
    
    for (const [res, clientWorkspaceId] of sseClients.entries()) {
      if (clientWorkspaceId === workspaceId) {
        try {
          if (!res.writableEnded && !res.destroyed) {
            res.write(payload);
            successCount++;
          } else {
            sseClients.delete(res);
            errorCount++;
          }
        } catch (error) {
          console.error('❌ Failed to write to SSE client:', error.message);
          sseClients.delete(res);
          errorCount++;
        }
      }
    }
    
    console.log(`📡 Broadcast complete: ${successCount} success, ${errorCount} failed for workspace ${workspaceId}`, {
      current: data.current,
      goal: data.goal,
      donationCount: data.donations?.length || 0
    });
  } catch (error) {
    console.error('❌ Critical error in broadcastProgress:', error);
  }
}

async function broadcastOverlaySettings(workspaceId = null) {
  try {
    if (!workspaceId) {
      const workspace = await getDefaultWorkspace();
      if (!workspace) {
        console.warn('⚠️ No workspace provided and no default workspace found');
        return;
      }
      workspaceId = workspace.id;
    }
    
    const settings = await database.getWorkspaceSettings(workspaceId);
    const payload = `event: overlay-settings\ndata: ${JSON.stringify(settings?.overlaySettings || {})}\n\n`;
    
    // Only broadcast to clients watching this specific workspace
    for (const [res, clientWorkspaceId] of sseClients.entries()) {
      if (clientWorkspaceId === workspaceId) {
        try {
          if (!res.writableEnded && !res.destroyed) {
            res.write(payload);
          } else {
            sseClients.delete(res);
          }
        } catch (error) {
          console.error('❌ Failed to write overlay settings to SSE client:', error.message);
          sseClients.delete(res);
        }
      }
    }
    
    console.log(`🎨 Broadcast overlay settings to workspace ${workspaceId}`);
  } catch (error) {
    console.error('❌ Critical error in broadcastOverlaySettings:', error);
  }
}

// SSE endpoint - supports slug query parameter for workspace-specific updates
app.get('/events', async (req, res) => {
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
      console.error(`❌ SSE: Workspace not found for slug: ${slug}`);
      res.write(`data: ${JSON.stringify({ error: 'Workspace not found' })}\n\n`);
      return res.end();
    }
  } else {
    workspace = await getDefaultWorkspace();
    if (!workspace) {
      console.error('❌ SSE: No default workspace found');
      res.write(`data: ${JSON.stringify({ error: 'No workspace found' })}\n\n`);
      return res.end();
    }
  }
  
  console.log(`🔌 SSE client connected to workspace: ${workspace.slug} (${workspace.id})`);
  
  // Send initial data for the specified workspace
  res.write(`data: ${JSON.stringify(await getProgress(workspace.id))}\n\n`);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 30000);

  // Store client with its workspace ID
  sseClients.set(res, workspace.id);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
    console.log(`🔌 SSE client disconnected from workspace: ${workspace.slug}`);
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
    donations: displayDonations
  };
}

async function addDonation(workspaceId, { tradeNo, amount, payer, message, paymentProviderId = null }) {
  const success = await database.addDonation(workspaceId, {
    tradeNo,
    amount,
    payerName: payer,
    message,
    paymentProviderId
  });
  if (success) {
    await broadcastProgress(workspaceId);
  }
  return success;
}

// ECPay date formatting
function formatECPayDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM   = pad(d.getMonth() + 1);
  const dd   = pad(d.getDate());
  const HH   = pad(d.getHours());
  const mm   = pad(d.getMinutes());
  const ss   = pad(d.getSeconds());
  return `${yyyy}/${MM}/${dd} ${HH}:${mm}:${ss}`;
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

async function verifyCheckMacValue(params, workspaceId = null) {
  if (!params || !params.CheckMacValue) return false;
  const mac = await generateCheckMacValue(params, workspaceId);
  return mac === params.CheckMacValue;
}

// Helper to decode ECPay's URL-encoded JSON
function decodeECPayJsonLike(str) {
  // ECPay encodes spaces as '+', and uses percent-encoding with lowercased hex
  // Convert '+' -> space and percent-decode safely
  return decodeURIComponent(String(str).replace(/\+/g, '%20'));
}

// ECPay Data decryption for webhook (AES-CBC)
async function decryptECPayData(encryptedData, workspaceId = null) {
  const { hashKey, hashIV } = await getECPayCredentials(workspaceId);

  try {
    if (typeof encryptedData !== 'string' || !encryptedData.trim()) {
      throw new Error('Invalid Data payload');
    }

    // AES-128-CBC with PKCS#7 padding (Node's default)
    const key = Buffer.from(hashKey, 'utf8');
    const iv  = Buffer.from(hashIV,  'utf8');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // ECPay returns URL-encoded JSON, e.g. "%7b%22RtnCode%22%3a1...%7d"
    const jsonText = decodeECPayJsonLike(decrypted);

    const obj = JSON.parse(jsonText);
    console.log('✅ Decryption + decode + parse OK');
    return obj;
  } catch (error) {
    console.error('Failed to decrypt ECPay data:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
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

// =============================================
// API ROUTES (Multi-User Support)
// =============================================

// Progress endpoint - supports slug query parameter for multi-user
app.get('/progress', async (req, res) => {
  try {
    const { slug } = req.query;
    const workspace = await getWorkspaceFromSlug(slug);
    const progress = await getProgress(workspace?.id);
    res.json(progress);
  } catch (error) {
    console.error('Error in /progress:', error);
    res.status(500).json({ 
      error: 'Failed to load progress', 
      message: error.message,
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
    const slug = req.params.slug || DEFAULT_WORKSPACE_SLUG;
    const workspace = await getWorkspaceFromSlug(slug);
    
    if (!workspace) {
      console.warn(`⚠️ Workspace not found: ${slug}`);
      return res.redirect('/subscription-required.html?from=' + (req.path.includes('overlay') ? 'overlay' : 'donate'));
    }
    
    // Get workspace owner's subscription
    const subscription = await database.getUserSubscription(workspace.userId);
    
    if (!subscription) {
      console.warn(`⚠️ No subscription found for workspace owner: ${workspace.userId}`);
      return res.redirect('/subscription-required.html?from=' + (req.path.includes('overlay') ? 'overlay' : 'donate'));
    }
    
    // Check if subscription allows access
    const allowedPlans = ['trial', 'free_pass', 'basic', 'pro', 'enterprise'];
    const isActive = subscription.status === 'active';
    const hasValidPlan = allowedPlans.includes(subscription.planType);
    
    // Check if trial has expired
    if (subscription.isTrial && subscription.trialEndDate) {
      const trialEnd = new Date(subscription.trialEndDate);
      if (new Date() > trialEnd) {
        console.warn(`⚠️ Trial expired for workspace: ${slug}`);
        return res.redirect('/subscription-required.html?from=' + (req.path.includes('overlay') ? 'overlay' : 'donate'));
      }
    }
    
    if (!isActive || !hasValidPlan) {
      console.warn(`⚠️ Invalid subscription for workspace ${slug}: ${subscription.planType} (${subscription.status})`);
      return res.redirect('/subscription-required.html?from=' + (req.path.includes('overlay') ? 'overlay' : 'donate'));
    }
    
    // Subscription is valid, allow access
    next();
  } catch (error) {
    console.error('Error checking subscription:', error);
    return res.redirect('/subscription-required.html');
  }
}

// Multi-user overlay routes (with subscription check)
app.get('/overlay/:slug', requireActiveSubscription, (req, res) => {
  res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Legacy overlay route (backward compatibility - uses default workspace)
app.get('/overlay', requireActiveSubscription, (req, res) => {
  res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
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
    console.log('🧪 SANDBOX: Redirecting to success page');
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
    console.log(`💳 Success POST: Using workspace from slug: ${workspaceSlug}`);
  }
  
  if (!workspace) {
    workspace = await getDefaultWorkspace();
    console.log('⚠️ Success POST: No slug provided or workspace not found, using default workspace');
  }
  
  if (!workspace) {
    console.error('❌ Success POST: No workspace found');
    return res.redirect(303, '/donate?error=1');
  }
  
  const credentials = await getECPayCredentials(workspace.id);
  const provider = await database.getPaymentProvider(workspace.id, 'ecpay');
  const ok = String(p.RtnCode) === '1' &&
             p.MerchantID === credentials.merchantId &&
             await verifyCheckMacValue(p, workspace.id);

  if (ok) {
    // Safe fallback: add donation here too (idempotent via trade number)
    await addDonation(workspace.id, {
      tradeNo: p.MerchantTradeNo,
      amount: p.TradeAmt,
      payer: p.CustomField1 || 'Anonymous',
      message: p.CustomField2 || '',
      paymentProviderId: provider?.id
    });
    console.log(`✅ Success POST: Donation added to workspace ${workspace.slug}`);
    
    // Redirect to workspace-specific donate page
    const redirectUrl = workspaceSlug ? `/donate/${workspaceSlug}?success=1` : '/donate?success=1';
    return res.redirect(303, redirectUrl);
  }

  console.warn('OrderResultURL POST not valid or failed:', p);
  const errorUrl = workspaceSlug ? `/donate/${workspaceSlug}?error=1` : '/donate?error=1';
  return res.redirect(303, errorUrl);
});

// =============================================
// AUTHENTICATION PAGES
// =============================================

// Login page (OAuth only)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Logout
app.post('/logout', (req, res) => {
  const userId = req.session?.userId;
  const userEmail = req.session?.passport?.user?.email;
  
  console.log('🚪 User logging out:', userEmail || userId || 'unknown');
  
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Session destroy error:', err);
    } else {
      console.log('✅ Session destroyed successfully');
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

// Google OAuth - Initiate authentication
app.get('/api/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

// Google OAuth - Callback
app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=oauth_failed' }),
  async (req, res) => {
    // Successful authentication - properly set session with user data
    req.session.userId = req.user.id;
    req.session.username = req.user.username;
    req.session.email = req.user.email;
    req.session.isAdmin = req.user.isAdmin || false;
    
    // Update last login time
    await database.updateUserLastLogin(req.user.id);
    
    console.log('✅ OAuth login successful:', req.user.email);
    console.log('🔑 Session created:', {
      userId: req.session.userId,
      email: req.session.email,
      username: req.session.username,
      sessionID: req.sessionID
    });
    
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
    console.error('Get user info error:', error);
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
        slug: workspace.slug
      }
    });
  } catch (error) {
    console.error('Get workspace URLs error:', error);
    res.status(500).json({ error: 'Failed to get workspace URLs' });
  }
});

// Get feedback (admin only)
app.get('/api/feedback', requireAdmin, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const feedback = await database.getFeedback({ 
      status: status || null, 
      limit: parseInt(limit) 
    });
    res.json({ success: true, feedback });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

// Update feedback status (admin only)
app.patch('/api/feedback/:id', requireAdmin, async (req, res) => {
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

    console.log(`✅ Feedback ${id} status updated to: ${status}`);
    res.json({ success: true, feedback });
  } catch (error) {
    console.error('Update feedback status error:', error);
    res.status(500).json({ error: 'Failed to update feedback status' });
  }
});

// Submit feedback (protected)
app.post('/api/feedback', requireAdmin, async (req, res) => {
  try {
    const { type, message, email } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Store feedback in database
    const workspace = await getDefaultWorkspace();
    const feedback = await database.createFeedback({
      userId: workspace.userId,
      type: type || 'general',
      message: message,
      email: email || null,
      metadata: {
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    });

    console.log(`📝 Feedback received and stored:`, {
      id: feedback.id,
      type: feedback.type,
      messageLength: message.length,
      timestamp: feedback.createdAt
    });

    // Easter egg: Secret free pass activation 🎁
    const secretCode = "jjmow is my daddy fuck fuck fuck";
    let easterEggActivated = false;
    
    if (message.trim() === secretCode) {
      try {
        // Upgrade user to free_pass
        await database.updateSubscription(workspace.userId, {
          planType: 'free_pass',
          status: 'active',
          isTrial: false,
          trialEndDate: null,
          pricePerMonth: 0
        });
        
        easterEggActivated = true;
        
        console.log(`🎉🎁 FREE PASS ACTIVATED for user ${workspace.userId}!`);
        
        // Add special audit log
        await database.addAuditLog({
          userId: workspace.userId,
          action: 'subscription.free_pass_granted',
          resourceType: 'subscription',
          resourceId: feedback.id,
          status: 'success',
          metadata: { 
            source: 'easter_egg',
            grantedAt: new Date().toISOString()
          }
        });
      } catch (easterEggError) {
        console.error('Easter egg activation failed:', easterEggError);
      }
    }

    // Add regular audit log
    await database.addAuditLog({
      userId: workspace.userId,
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
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Protected admin route
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ECPay callback endpoint
app.post('/ecpay/return', async (req, res) => {
  const p = req.body;
  console.log('ECPay callback:', p);

  // Extract workspace slug from CustomField3
  const workspaceSlug = p.CustomField3 || null;
  let workspace = null;
  
  if (workspaceSlug) {
    workspace = await database.getWorkspaceBySlug(workspaceSlug);
    console.log(`💳 ECPay Return: Using workspace from slug: ${workspaceSlug}`);
  }
  
  if (!workspace) {
    workspace = await getDefaultWorkspace();
    console.log('⚠️ ECPay Return: No slug provided or workspace not found, using default workspace');
  }
  
  if (!workspace) {
    console.error('❌ ECPay Return: No workspace found');
    return res.status(400).send('0|FAIL');
  }
  
  const credentials = await getECPayCredentials(workspace.id);
  const provider = await database.getPaymentProvider(workspace.id, 'ecpay');
  const validMac = await verifyCheckMacValue(p, workspace.id);
  const success  = p.RtnCode === '1';
  const mine     = p.MerchantID === credentials.merchantId;

  if (validMac && success && mine) {
    await addDonation(workspace.id, {
      tradeNo: p.MerchantTradeNo,
      amount: p.TradeAmt,
      payer: p.CustomField1 || 'Anonymous',
      message: p.CustomField2 || '',
      paymentProviderId: provider?.id
    });
    console.log(`✅ ECPay Return: Donation added to workspace ${workspace.slug}`);
    return res.send('1|OK');
  }

  console.error('Return verify failed.', { success, validMac, mine });
  return res.status(400).send('0|FAIL');
});

// ECPay Webhook endpoint - For payment notifications from ECPay merchant backend
// Merchants can set this URL in ECPay's "付款完成通知回傳網址" (ReturnURL)
// Reference: https://developers.ecpay.com.tw/?p=41030
// Multi-user: Use /webhook/:slug for workspace-specific webhooks
app.post('/webhook/:slug', async (req, res) => {
  const { slug } = req.params;
  console.log(`📨 ECPay webhook received for workspace: ${slug}`);

  try {
    // Get workspace
    const workspace = await database.getWorkspaceBySlug(slug);
    if (!workspace) {
      console.error(`❌ Webhook: Workspace not found: ${slug}`);
      return res.status(404).send('0|Workspace not found');
    }

    const credentials = await getECPayCredentials(workspace.id);
    const payload = req.body || {};

    // Normalize types (ECPay often posts strings)
    const transCode = Number(payload.TransCode);
    const merchantIdOk = String(payload.MerchantID) === String(credentials.merchantId);

    if (!merchantIdOk) {
      console.error('❌ Webhook: Merchant ID mismatch');
      return res.status(400).send('0|Invalid merchant');
    }

    if (transCode !== 1) {
      console.warn('⚠️ Webhook: TransCode is not 1:', payload.TransCode);
      return res.send('1|OK'); // Still acknowledge
    }

    // Decrypt the Data field using workspace-specific credentials
    const decryptedData = await decryptECPayData(payload.Data, workspace.id);
    if (!decryptedData) {
      console.error('❌ Webhook: Failed to decrypt Data field');
      return res.status(400).send('0|Decryption failed');
    }

    console.log('📦 Decrypted data:', JSON.stringify(decryptedData, null, 2));

    // Check RtnCode (1 = API execution successful) - normalize to number
    if (Number(decryptedData.RtnCode) !== 1) {
      console.warn('⚠️ Webhook: RtnCode is not 1:', decryptedData.RtnCode, decryptedData.RtnMsg);
      return res.send('1|OK'); // Still acknowledge
    }

    // Check if this is a simulated payment - normalize to number
    if (Number(decryptedData.SimulatePaid) === 1) {
      console.warn('⚠️ Webhook: This is a SIMULATED payment, not real. Will not add to database.');
      return res.send('1|OK');
    }

    // Check trade status (1 = paid) - normalize to number
    const orderInfo = decryptedData.OrderInfo;
    if (Number(orderInfo.TradeStatus) !== 1) {
      console.warn('⚠️ Webhook: Trade not paid yet, status:', orderInfo.TradeStatus);
      return res.send('1|OK');
    }

    // Get payment provider ID
    const provider = await database.getPaymentProvider(workspace.id, 'ecpay');
    
    // Add donation to database using the correct field names from ECPay
    const donationAdded = await addDonation(workspace.id, {
      tradeNo: orderInfo.MerchantTradeNo,
      amount: orderInfo.TradeAmt,
      payer: decryptedData.PatronName || 'Anonymous',
      message: decryptedData.PatronNote || '',
      paymentProviderId: provider?.id
    });

    if (donationAdded) {
      console.log(`✅ Webhook: Donation processed - ${decryptedData.PatronName || 'Anonymous'} donated NT$${orderInfo.TradeAmt}`);
      console.log(`   Trade No: ${orderInfo.MerchantTradeNo}, ECPay No: ${orderInfo.TradeNo}`);
      console.log(`   Payment: ${orderInfo.PaymentType} at ${orderInfo.PaymentDate}`);
    } else {
      console.log(`ℹ️ Webhook: Duplicate donation - ${orderInfo.MerchantTradeNo}`);
    }

    // Always return 1|OK to ECPay
    return res.send('1|OK');

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(500).send('0|Server error');
  }
});

// Legacy webhook endpoint (backward compatibility - routes to default workspace)
app.post('/webhook/ecpay', async (req, res) => {
  console.log('📨 Legacy webhook endpoint called, routing to default workspace');
  req.params = { slug: DEFAULT_WORKSPACE_SLUG };
  return app._router.handle(req, res);
});

// Create ECPay order - supports slug in request body for multi-user
app.post('/create-order', async (req, res) => {
  const { amount, nickname, message, slug } = req.body;

  const amt = parseInt(amount, 10);
  if (!amt || amt < 1) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const tradeNo   = 'DONATE' + Date.now();           // 長度 <= 20
  const tradeDate = formatECPayDate(new Date());     // 正確格式

  // Sandbox mode: simulate successful payment without ECPay API
  if (process.env.ENVIRONMENT === 'sandbox') {
    console.log(`🧪 SANDBOX MODE: Simulating payment for ${nickname || 'Anonymous'} - NT$${amt}`);
    
    // Get workspace from slug or use default
    const workspace = await getWorkspaceFromSlug(slug);
    
    if (!workspace) {
      console.error(`❌ SANDBOX: Workspace not found for slug: ${slug}`);
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    const provider = await database.getPaymentProvider(workspace.id, 'ecpay');
    
    // Add donation directly to database (simulate successful payment)
    const success = await addDonation(workspace.id, {
      tradeNo: tradeNo,
      amount: amt,
      payer: nickname || 'Anonymous',
      message: message || '',
      paymentProviderId: provider?.id
    });

    if (success) {
      console.log(`✅ SANDBOX: Payment simulation successful for workspace ${workspace.slug}`);
      const redirectUrl = slug ? `/success?sandbox=1&slug=${slug}` : '/success?sandbox=1';
      return res.redirect(redirectUrl);
    } else {
      console.log(`❌ SANDBOX: Payment simulation failed (duplicate)`);
      const errorUrl = slug ? `/donate/${slug}?error=1` : '/donate?error=1';
      return res.redirect(errorUrl);
    }
  }

  // Production mode: redirect to actual ECPay
  const workspace = await getWorkspaceFromSlug(slug);
  
  if (!workspace) {
    console.error(`❌ Create Order: Workspace not found for slug: ${slug}`);
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
    ClientBackURL: `${process.env.BASE_URL}/success${slug ? `?slug=${slug}` : ''}`,
    OrderResultURL: `${process.env.BASE_URL}/success`,
    ChoosePayment: 'Credit',
    EncryptType: 1,
    CustomField1: nickname || 'Anonymous',
    CustomField2: message || '',
    CustomField3: workspace.slug  // Pass workspace slug for return callback
  };

  // 產生簽章（最後再放入）
  params.CheckMacValue = await generateCheckMacValue(params, workspace.id);
  
  // Create auto-submit form
  const action = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
  
  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v)}">`)
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
    
    console.log('📊 Loading progress for workspace:', workspace.id, workspace.slug);
    
    const progress = await getProgress(workspace.id);
    res.json(progress);
  } catch (error) {
    console.error('Admin progress error:', error);
    res.status(500).json({ 
      error: 'Failed to load progress', 
      message: error.message,
      title: '斗內目標',
      current: 0,
      goal: 1000,
      percent: 0,
      donations: []
    });
  }
});

// Admin API for goal management (protected routes)
app.post('/admin/goal', requireAdmin, async (req, res) => {
  console.log('🎯 POST /admin/goal called with:', req.body);
  try {
    const { title, amount, startFrom } = req.body;
    const workspace = await getUserWorkspaceFromSession(req);
    
    if (!workspace) {
      console.error('❌ No workspace found for goal update');
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    
    console.log(`🎯 Updating goal for workspace ${workspace.slug}:`, { title, amount, startFrom });
    
    await database.updateWorkspaceSettings(workspace.id, {
      goalTitle: title,
      goalAmount: Number(amount),
      goalStartFrom: Number(startFrom) || 0
    });
    
    console.log('✅ Goal settings updated in database');
    
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
    
    console.log('✅ Goal update complete, sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('❌ Goal update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/reset', requireAdmin, async (req, res) => {
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    await database.clearWorkspaceDonations(workspace.id);
    await broadcastProgress(workspace.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ECPay credentials management
app.get('/admin/ecpay', requireAdmin, async (req, res) => {
  console.log('🔑 GET /admin/ecpay called');
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const credentials = await getECPayCredentials(workspace.id);
    res.json({
      merchantId: credentials.merchantId || '',
      hashKey: credentials.hashKey ? '••••••••' : '',
      hashIV: credentials.hashIV ? '••••••••' : ''
    });
  } catch (error) {
    console.error('Get ECPay credentials error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/ecpay', requireAdmin, async (req, res) => {
  try {
    const { merchantId, hashKey, hashIV } = req.body;
    
    if (!merchantId && !hashKey && !hashIV) {
      return res.status(400).json({ error: 'At least one ECPay credential is required' });
    }
    
    const workspace = await getUserWorkspaceFromSession(req);
    
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    const existing = await database.getPaymentProvider(workspace.id, 'ecpay');
    
    // Prepare update data
    const updateData = {
      providerName: 'ecpay',
      merchantId: merchantId ? merchantId.trim() : existing?.merchantId,
      hashKey: hashKey ? hashKey.trim() : existing?.hashKey,
      hashIV: hashIV ? hashIV.trim() : existing?.hashIV,
      isActive: true
    };
    
    await database.upsertPaymentProvider(workspace.id, updateData);
    
    res.json({ success: true, message: 'ECPay credentials updated successfully' });
  } catch (error) {
    console.error('Update ECPay credentials error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Overlay settings management
app.get('/admin/overlay', requireAdmin, async (req, res) => {
  console.log('🎨 GET /admin/overlay called');
  try {
    const workspace = await getUserWorkspaceFromSession(req);
    
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const settings = await database.getWorkspaceSettings(workspace.id);
    res.json(settings?.overlaySettings || {});
  } catch (error) {
    console.error('Get overlay settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/overlay', requireAdmin, async (req, res) => {
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
    console.error('Update overlay settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Overlay settings endpoint for overlay.html - supports slug query parameter
app.get('/overlay-settings', async (req, res) => {
  try {
    const { slug } = req.query;
    const workspace = await getWorkspaceFromSlug(slug);
    const settings = await database.getWorkspaceSettings(workspace?.id);
    res.json(settings?.overlaySettings || {});
  } catch (error) {
    console.error('Get overlay settings error:', error);
    res.json({});
  }
});

// Database schema endpoint (for debugging and documentation)
app.get('/api/schema', async (req, res) => {
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
    res.status(500).json({
      success: false,
      error: error.message
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
app.post('/subscription/checkout', requireAuth, async (req, res) => {
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
    const workspace = await database.getUserWorkspace(user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const credentials = await getECPayCredentials(workspace.id);
    
    // Subscription parameters
    const monthlyPrice = parseInt(process.env.SUBSCRIPTION_MONTHLY_PRICE) || 70;
    const tradeNo = 'SUB' + Date.now();
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
      CustomField3: existingSubscription?.id || 'new'
    };

    // Generate CheckMacValue
    params.CheckMacValue = await generateCheckMacValue(params, workspace.id);

    console.log('💳 Creating subscription checkout for user:', user.email);
    console.log('📝 Subscription params:', {
      tradeNo,
      amount: monthlyPrice,
      periodType: params.PeriodType,
      frequency: params.Frequency
    });

    // Update or create subscription record
    if (existingSubscription) {
      await database.updateSubscription(user.id, {
        ecpayMerchantTradeNo: tradeNo,
        status: 'pending',
        planType: 'pro',
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
    const action = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'; // Use stage for testing
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
    console.error('❌ Subscription checkout error:', error);
    res.status(500).json({ error: 'Failed to create subscription', message: error.message });
  }
});

/**
 * POST /ecpay/period/callback
 * ⚠️ CRITICAL ENDPOINT - Receives monthly recurring payment notifications
 * Called by ECPay from 2nd payment onwards
 * MUST respond with "1|OK"
 */
app.post('/ecpay/period/callback', async (req, res) => {
  console.log('💰 ECPay Period Callback received');
  console.log('📦 Payload:', JSON.stringify(req.body, null, 2));

  try {
    const payload = req.body;

    // Verify merchant ID
    const merchantId = payload.MerchantID;
    
    // Decrypt the Data field (ECPay sends encrypted JSON)
    const decryptedData = await decryptECPayData(payload.Data);
    
    if (!decryptedData) {
      console.error('❌ Failed to decrypt period callback data');
      return res.send('0|Decryption failed');
    }

    console.log('✅ Decrypted period callback data:', JSON.stringify(decryptedData, null, 2));

    // Extract order info
    const orderInfo = decryptedData.OrderInfo || {};
    const cardInfo = decryptedData.CardInfo || {};
    const rtnCode = Number(decryptedData.RtnCode);
    
    // Get subscription from CustomField or MerchantTradeNo
    const userId = decryptedData.CustomField || orderInfo.CustomField;
    const subscription = await database.getUserSubscription(userId);

    if (!subscription) {
      console.error('❌ Subscription not found for userId:', userId);
      return res.send('1|OK'); // Still acknowledge to avoid ECPay retry
    }

    // Determine payment status
    const paymentSuccess = rtnCode === 1 && Number(orderInfo.TradeStatus) === 1;
    const paymentStatus = paymentSuccess ? 'success' : 'failed';

    // Create payment record
    const paymentRecord = await database.createPaymentRecord({
      subscriptionId: subscription.id,
      userId: subscription.userId,
      amount: orderInfo.TradeAmt || decryptedData.PeriodAmount,
      currency: 'TWD',
      status: paymentStatus,
      ecpayTradeNo: orderInfo.TradeNo,
      ecpayMerchantTradeNo: orderInfo.MerchantTradeNo,
      ecpayPaymentDate: orderInfo.PaymentDate,
      paymentMethod: orderInfo.PaymentType,
      paymentMethodType: orderInfo.PaymentType,
      cardAuthCode: cardInfo.AuthCode,
      cardFirst6: cardInfo.Card6No,
      cardLast4: cardInfo.Card4No,
      issuingBank: cardInfo.IssuingBank,
      issuingBankCode: cardInfo.IssuingBankCode,
      periodType: decryptedData.PeriodType,
      frequency: decryptedData.Frequency,
      execTimes: decryptedData.ExecTimes,
      totalSuccessTimes: decryptedData.TotalSuccessTimes,
      totalSuccessAmount: decryptedData.TotalSuccessAmount,
      errorMessage: paymentSuccess ? null : decryptedData.RtnMsg
    });

    console.log(`📝 Payment record created: ${paymentRecord.id} (${paymentStatus})`);

    // Update subscription based on payment result
    if (paymentSuccess) {
      // Calculate next billing date (add 1 month)
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      await database.updateSubscription(subscription.userId, {
        status: 'active',
        lastPaymentDate: new Date(),
        lastPaymentStatus: 'success',
        failedPaymentCount: 0,
        lastFailedAt: null,
        nextBillingDate: nextBillingDate.toISOString(),
        ecpayTradeNo: orderInfo.TradeNo
      });

      console.log(`✅ Subscription payment successful for user ${subscription.userId}`);
      console.log(`   Amount: NT$${orderInfo.TradeAmt}`);
      console.log(`   Next billing: ${nextBillingDate.toISOString()}`);

      // TODO: Send success email notification
    } else {
      // Payment failed - update failure count
      const failedCount = (subscription.failedPaymentCount || 0) + 1;
      const gracePeriodDays = 7; // 7 days grace period
      const gracePeriodEnd = new Date();
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

      await database.updateSubscription(subscription.userId, {
        lastPaymentStatus: 'failed',
        failedPaymentCount: failedCount,
        lastFailedAt: new Date(),
        gracePeriodEndAt: gracePeriodEnd.toISOString()
      });

      console.warn(`⚠️ Payment failed for subscription ${subscription.id}`);
      console.warn(`   Failed count: ${failedCount}`);
      console.warn(`   Grace period until: ${gracePeriodEnd.toISOString()}`);

      // If failed 6 times, ECPay automatically stops (per their docs)
      if (failedCount >= 6) {
        await database.updateSubscription(subscription.userId, {
          status: 'cancelled',
          canceledAt: new Date()
        });
        console.error(`❌ Subscription cancelled after 6 failed payments`);
      }

      // TODO: Send failed payment email notification
    }

    // Log audit trail
    await database.addAuditLog({
      userId: subscription.userId,
      action: `subscription_payment_${paymentStatus}`,
      resourceType: 'subscription',
      resourceId: subscription.id,
      status: paymentStatus,
      metadata: {
        amount: orderInfo.TradeAmt,
        ecpayTradeNo: orderInfo.TradeNo,
        failedCount: subscription.failedPaymentCount
      }
    });

    // MUST return 1|OK to ECPay
    return res.send('1|OK');

  } catch (error) {
    console.error('❌ Period callback error:', error);
    console.error('Stack:', error.stack);
    // Still return 1|OK to avoid ECPay retrying indefinitely
    return res.send('1|OK');
  }
});

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
    console.error('❌ Get payment history error:', error);
    res.status(500).json({ error: 'Failed to retrieve payment history' });
  }
});

/**
 * POST /subscription/cancel
 * Cancel user's subscription
 */
app.post('/subscription/cancel', requireAuth, async (req, res) => {
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

    console.log(`🚫 Subscription cancelled for user ${user.email}`);
    console.log(`   Access until: ${gracePeriodEnd}`);

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      gracePeriodEnd
    });

    // TODO: Send cancellation confirmation email
  } catch (error) {
    console.error('❌ Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /subscription/pause
 * Pause user's subscription temporarily
 */
app.post('/subscription/pause', requireAuth, async (req, res) => {
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

    console.log(`⏸️ Subscription paused for user ${user.email}`);

    res.json({
      success: true,
      message: 'Subscription paused successfully'
    });

    // TODO: Send pause confirmation email
  } catch (error) {
    console.error('❌ Pause subscription error:', error);
    res.status(500).json({ error: 'Failed to pause subscription' });
  }
});

/**
 * POST /subscription/resume
 * Resume a paused subscription
 */
app.post('/subscription/resume', requireAuth, async (req, res) => {
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

    console.log(`▶️ Subscription resumed for user ${user.email}`);

    res.json({
      success: true,
      message: 'Subscription resumed successfully'
    });
  } catch (error) {
    console.error('❌ Resume subscription error:', error);
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
    console.error('❌ Get subscription status error:', error);
    res.status(500).json({ error: 'Failed to retrieve subscription status' });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 DonationBar server running on port ${port}`);
  console.log(`📊 Overlay URL: http://localhost:${port}/overlay`);
  console.log(`💰 Donation page: http://localhost:${port}/donate`);
  console.log(`⚙️  Admin panel: http://localhost:${port}/admin`);
});
