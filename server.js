import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import database from './database.js';

const app = express();
const __dirname = path.resolve();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Session middleware - use PostgreSQL store in production, memory in sandbox
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'super-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
};

// Use PostgreSQL session store in production
if (process.env.DATABASE_URL && process.env.ENVIRONMENT !== 'sandbox') {
  const PgSession = connectPgSimple(session);
  
  // Parse DATABASE_URL for connection config
  const url = new URL(process.env.DATABASE_URL);
  
  sessionConfig.store = new PgSession({
    conObject: {
      host: url.hostname,
      port: url.port || 5432,
      database: url.pathname.slice(1),
      user: url.username,
      password: url.password,
      ssl: { rejectUnauthorized: false }
    },
    tableName: 'session',
    createTableIfMissing: true
  });
  console.log('🔐 Using PostgreSQL session store');
} else {
  console.log('🔐 Using in-memory session store (sandbox mode)');
}

app.use(session(sessionConfig));

const DB_PATH = path.join(__dirname, 'db.json');

// Database helpers
async function readDB() {
  return await database.readDB();
}

// ECPay credential helpers
async function getECPayCredentials() {
  const db = await readDB();
  
  // Check if credentials exist in database and are not empty
  if (db.ecpay && db.ecpay.merchantId && db.ecpay.hashKey && db.ecpay.hashIV) {
    return {
      merchantId: db.ecpay.merchantId,
      hashKey: db.ecpay.hashKey,
      hashIV: db.ecpay.hashIV
    };
  }
  
  // Fallback to environment variables
  const envCredentials = {
    merchantId: process.env.MERCHANT_ID,
    hashKey: process.env.HASH_KEY,
    hashIV: process.env.HASH_IV
  };
  
  // If env variables exist and db doesn't have them, save to db
  if (envCredentials.merchantId && envCredentials.hashKey && envCredentials.hashIV) {
    if (!db.ecpay) db.ecpay = {};
    db.ecpay.merchantId = envCredentials.merchantId;
    db.ecpay.hashKey = envCredentials.hashKey;
    db.ecpay.hashIV = envCredentials.hashIV;
    await writeDB(db);
    console.log('💾 ECPay credentials migrated from .env to database');
  }
  
  return envCredentials;
}

async function writeDB(data) {
  return await database.writeDB(data);
}

// SSE: Server-Sent Events for real-time updates
const sseClients = new Set();

async function broadcastProgress() {
  const data = await getProgress();
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (error) {
      sseClients.delete(res);
    }
  }
}

async function broadcastOverlaySettings() {
  const db = await readDB();
  const payload = `event: overlay-settings\ndata: ${JSON.stringify(db.overlaySettings || {})}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (error) {
      sseClients.delete(res);
    }
  }
}

// SSE endpoint
app.get('/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial data
  res.write(`data: ${JSON.stringify(await getProgress())}\n\n`);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 30000);

  sseClients.add(res);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Helper functions
async function getProgress() {
  const db = await readDB();
  const actualDonations = db.total || 0;
  const startFrom = db.goal.startFrom || 0;
  const current = actualDonations + startFrom; // Add start_from to actual donations
  const goal = db.goal.amount;
  const percent = Math.min(100, Math.round((current / goal) * 100));
  
  return {
    title: db.goal.title,
    current,
    actualDonations, // Actual donation amount without start_from
    startFrom,
    goal,
    percent,
    donations: db.donations.slice(-5) // Last 5 donations for display
  };
}

async function addDonation({ tradeNo, amount, payer, message }) {
  const success = await database.addDonation({ tradeNo, amount, payer, message });
  if (success) {
    await broadcastProgress();
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
async function generateCheckMacValue(params) {
  const credentials = await getECPayCredentials();
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

async function verifyCheckMacValue(params) {
  if (!params || !params.CheckMacValue) return false;
  const mac = await generateCheckMacValue(params);
  return mac === params.CheckMacValue;
}

// Authentication middleware
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  
  // Return JSON error for API requests (AJAX)
  // Check multiple indicators of AJAX/JSON requests
  const isApiRequest = 
    req.xhr || 
    req.headers['x-requested-with'] === 'XMLHttpRequest' ||
    req.headers.accept?.includes('application/json') ||
    req.headers['content-type']?.includes('application/json') ||
    req.path.startsWith('/admin/');
  
  if (isApiRequest) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Please login first' });
  }
  
  return res.redirect('/login');
}

// API Routes
app.get('/progress', async (req, res) => {
  try {
    const progress = await getProgress();
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

// Favicon route (prevent 404 errors)
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Page routes
app.get('/overlay', (req, res) => {
  res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/donate', (req, res) => {
  // Set proper headers to prevent caching issues
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'donate.html'));
});

// Success page - handle both GET (ClientBackURL) and POST (OrderResultURL)
app.get('/success', (req, res) => {
  // Handle sandbox mode parameter
  const { sandbox } = req.query;
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  if (sandbox === '1') {
    console.log('🧪 SANDBOX: Redirecting to success page');
  }
  
  return res.redirect('/donate?success=1');
});

app.post('/success', async (req, res) => {
  const p = req.body || {};
  const credentials = await getECPayCredentials();
  const ok = String(p.RtnCode) === '1' &&
             p.MerchantID === credentials.merchantId &&
             await verifyCheckMacValue(p);

  if (ok) {
    // Safe fallback: add donation here too (idempotent via seenTradeNos)
    await addDonation({
      tradeNo: p.MerchantTradeNo,
      amount: p.TradeAmt,
      payer: p.CustomField1 || 'Anonymous',
      message: p.CustomField2 || ''
    });
    return res.redirect(303, '/donate?success=1');
  }

  console.warn('OrderResultURL POST not valid or failed:', p);
  return res.redirect(303, '/donate?error=1');
});

// Login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Handle login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.redirect('/login?error=invalid');
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/login');
  });
});

// Protected admin route
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ECPay callback endpoint
app.post('/ecpay/return', async (req, res) => {
  const p = req.body;
  console.log('ECPay callback:', p);

  const credentials = await getECPayCredentials();
  const validMac = await verifyCheckMacValue(p);
  const success  = p.RtnCode === '1';
  const mine     = p.MerchantID === credentials.merchantId;

  if (validMac && success && mine) {
    // （選配）比對金額：找回你建立訂單時的金額再比一次
    await addDonation({
      tradeNo: p.MerchantTradeNo,
      amount: p.TradeAmt,
      payer: p.CustomField1 || 'Anonymous',
      message: p.CustomField2 || ''
    });
    return res.send('1|OK');
  }

  console.error('Return verify failed.', { success, validMac, mine });
  return res.status(400).send('0|FAIL');
});

// Create ECPay order
app.post('/create-order', async (req, res) => {
  const { amount, nickname, message } = req.body;

  const amt = parseInt(amount, 10);
  if (!amt || amt < 1) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const tradeNo   = 'DONATE' + Date.now();           // 長度 <= 20
  const tradeDate = formatECPayDate(new Date());     // 正確格式

  // Sandbox mode: simulate successful payment without ECPay API
  if (process.env.ENVIRONMENT === 'sandbox') {
    console.log(`🧪 SANDBOX MODE: Simulating payment for ${nickname || 'Anonymous'} - NT$${amt}`);
    
    // Add donation directly to database (simulate successful payment)
    const success = await addDonation({
      tradeNo: tradeNo,
      amount: amt,
      payer: nickname || 'Anonymous',
      message: message || ''
    });

    if (success) {
      console.log(`✅ SANDBOX: Payment simulation successful`);
      return res.redirect('/success?sandbox=1');
    } else {
      console.log(`❌ SANDBOX: Payment simulation failed (duplicate)`);
      return res.redirect('/donate?error=1');
    }
  }

  // Production mode: redirect to actual ECPay
  const credentials = await getECPayCredentials();
  const params = {
    MerchantID: credentials.merchantId,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: String(amt),            // 整數字串
    TradeDesc: 'Stream Donation',
    ItemName: 'Stream Support x1',
    ReturnURL: `${process.env.BASE_URL}/ecpay/return`,
    ClientBackURL: `${process.env.BASE_URL}/success`,
    OrderResultURL: `${process.env.BASE_URL}/success`,
    ChoosePayment: 'Credit',
    EncryptType: 1,
    CustomField1: nickname || 'Anonymous',
    CustomField2: message || ''
  };

  // 產生簽章（最後再放入）
  params.CheckMacValue = await generateCheckMacValue(params);
  
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

// Admin API for goal management (protected routes)
app.post('/admin/goal', requireAdmin, async (req, res) => {
  const { title, amount, startFrom } = req.body;
  const db = await readDB();
  
  db.goal = {
    title: title || db.goal.title,
    amount: Number(amount) || db.goal.amount,
    startFrom: Number(startFrom) || 0
  };
  
  await writeDB(db);
  await broadcastProgress();
  
  res.json({ success: true, goal: db.goal });
});

app.post('/admin/reset', requireAdmin, async (req, res) => {
  const db = await readDB();
  db.total = 0;
  db.donations = [];
  db.seenTradeNos = [];
  
  await writeDB(db);
  await broadcastProgress();
  
  res.json({ success: true });
});

// ECPay credentials management
app.get('/admin/ecpay', requireAdmin, async (req, res) => {
  const db = await readDB();
  const credentials = await getECPayCredentials();
  res.json({
    merchantId: credentials.merchantId || '',
    hashKey: credentials.hashKey ? '••••••••' : '', // Mask for security
    hashIV: credentials.hashIV ? '••••••••' : ''
  });
});

app.post('/admin/ecpay', requireAdmin, async (req, res) => {
  const { merchantId, hashKey, hashIV } = req.body;
  
  // Require at least one field to be provided
  if (!merchantId && !hashKey && !hashIV) {
    return res.status(400).json({ error: 'At least one ECPay credential is required' });
  }
  
  const db = await readDB();
  if (!db.ecpay) db.ecpay = {};
  
  // Only update fields that are provided
  if (merchantId) db.ecpay.merchantId = merchantId.trim();
  if (hashKey) db.ecpay.hashKey = hashKey.trim();
  if (hashIV) db.ecpay.hashIV = hashIV.trim();
  
  await writeDB(db);
  
  res.json({ success: true, message: 'ECPay credentials updated successfully' });
});

// Overlay settings management
app.get('/admin/overlay', requireAdmin, async (req, res) => {
  const db = await readDB();
  res.json(db.overlaySettings || {});
});

app.post('/admin/overlay', requireAdmin, async (req, res) => {
  const settings = req.body;
  const db = await readDB();
  
  // Validate and sanitize settings
  if (!db.overlaySettings) db.overlaySettings = {};
  
  // Update settings with validation
  if (typeof settings.showDonationAlert === 'boolean') {
    db.overlaySettings.showDonationAlert = settings.showDonationAlert;
  }
  if (typeof settings.fontSize === 'number' && settings.fontSize > 0) {
    db.overlaySettings.fontSize = Math.max(10, Math.min(50, settings.fontSize));
  }
  if (typeof settings.fontColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(settings.fontColor)) {
    db.overlaySettings.fontColor = settings.fontColor;
  }
  if (typeof settings.backgroundColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(settings.backgroundColor)) {
    db.overlaySettings.backgroundColor = settings.backgroundColor;
  }
  if (typeof settings.progressBarColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(settings.progressBarColor)) {
    db.overlaySettings.progressBarColor = settings.progressBarColor;
  }
  if (typeof settings.progressBarHeight === 'number' && settings.progressBarHeight > 0) {
    db.overlaySettings.progressBarHeight = Math.max(10, Math.min(100, settings.progressBarHeight));
  }
  if (typeof settings.progressBarCornerRadius === 'number' && settings.progressBarCornerRadius >= 0) {
    db.overlaySettings.progressBarCornerRadius = Math.max(0, Math.min(50, settings.progressBarCornerRadius));
  }
  if (typeof settings.alertDuration === 'number' && settings.alertDuration > 0) {
    db.overlaySettings.alertDuration = Math.max(1000, Math.min(30000, settings.alertDuration));
  }
  if (typeof settings.position === 'string') {
    const validPositions = ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'];
    if (validPositions.includes(settings.position)) {
      db.overlaySettings.position = settings.position;
    }
  }
  if (typeof settings.width === 'number' && settings.width > 0) {
    db.overlaySettings.width = Math.max(300, Math.min(1920, settings.width));
  }
  if (typeof settings.alertEnabled === 'boolean') {
    db.overlaySettings.alertEnabled = settings.alertEnabled;
  }
  if (typeof settings.alertSound === 'boolean') {
    db.overlaySettings.alertSound = settings.alertSound;
  }
  
  await writeDB(db);
  
  // Broadcast settings update to all connected overlays
  await broadcastOverlaySettings();
  
  res.json({ success: true, message: 'Overlay settings updated successfully', settings: db.overlaySettings });
});

// Overlay settings endpoint for overlay.html
app.get('/overlay-settings', async (req, res) => {
  const db = await readDB();
  res.json(db.overlaySettings || {});
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 DonationBar server running on port ${port}`);
  console.log(`📊 Overlay URL: http://localhost:${port}/overlay`);
  console.log(`💰 Donation page: http://localhost:${port}/donate`);
  console.log(`⚙️  Admin panel: http://localhost:${port}/admin`);
});
