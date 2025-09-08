import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import session from 'express-session';

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

const DB_PATH = path.join(__dirname, 'db.json');

// Database helpers
function readDB() { 
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); 
  } catch (error) {
    console.error('Error reading database:', error);
    return { goal: { title: "Goal", amount: 10000 }, total: 0, donations: [], seenTradeNos: [] };
  }
}

function writeDB(data) { 
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); 
}

// SSE: Server-Sent Events for real-time updates
const sseClients = new Set();

function broadcastProgress() {
  const data = getProgress();
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (error) {
      sseClients.delete(res);
    }
  }
}

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial data
  res.write(`data: ${JSON.stringify(getProgress())}\n\n`);

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
function getProgress() {
  const db = readDB();
  const current = db.total || 0;
  const goal = db.goal.amount;
  const percent = Math.min(100, Math.round((current / goal) * 100));
  
  return {
    title: db.goal.title,
    current,
    goal,
    percent,
    donations: db.donations.slice(-5) // Last 5 donations for display
  };
}

function addDonation({ tradeNo, amount, payer }) {
  const db = readDB();
  
  // Prevent duplicate processing
  if (db.seenTradeNos.includes(tradeNo)) {
    console.log(`Duplicate trade number: ${tradeNo}`);
    return false;
  }
  
  db.seenTradeNos.push(tradeNo);
  db.total = (db.total || 0) + Number(amount);
  db.donations.push({
    tradeNo,
    amount: Number(amount),
    payer: payer || 'Anonymous',
    at: new Date().toISOString()
  });
  
  writeDB(db);
  broadcastProgress();
  console.log(`New donation: ${payer} donated NT$${amount}`);
  
  return true;
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
function generateCheckMacValue(params) {
  const hashKey = process.env.HASH_KEY;
  const hashIV  = process.env.HASH_IV;

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

function verifyCheckMacValue(params) {
  if (!params || !params.CheckMacValue) return false;
  const mac = generateCheckMacValue(params);
  return mac === params.CheckMacValue;
}

// Authentication middleware
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  return res.redirect('/login');
}

// API Routes
app.get('/progress', (req, res) => {
  res.json(getProgress());
});

// Page routes
app.get('/overlay', (req, res) => {
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

app.post('/success', (req, res) => {
  // ECPay will POST a bunch of fields here (TradeNo, RtnCode, etc.)
  const { RtnCode } = req.body || {};
  // Use 303 to convert POST to GET and avoid "resubmit form" warnings on refresh
  if (String(RtnCode) === '1') {
    console.log('✅ PRODUCTION: ECPay payment successful');
    return res.redirect(303, '/donate?success=1');
  }
  console.log('❌ PRODUCTION: ECPay payment failed');
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
app.post('/ecpay/return', (req, res) => {
  const p = req.body;
  console.log('ECPay callback:', p);

  const validMac = verifyCheckMacValue(p);
  const success  = p.RtnCode === '1';
  const mine     = p.MerchantID === process.env.MERCHANT_ID;

  if (validMac && success && mine) {
    // （選配）比對金額：找回你建立訂單時的金額再比一次
    addDonation({
      tradeNo: p.MerchantTradeNo,
      amount: p.TradeAmt,
      payer: p.CustomField1 || 'Anonymous'
    });
    return res.send('1|OK');
  }

  console.error('Return verify failed.', { success, validMac, mine });
  return res.status(400).send('0|FAIL');
});

// Create ECPay order
app.post('/create-order', (req, res) => {
  const { amount, nickname } = req.body;

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
    const success = addDonation({
      tradeNo: tradeNo,
      amount: amt,
      payer: nickname || 'Anonymous'
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
  const params = {
    MerchantID: process.env.MERCHANT_ID,
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
    CustomField1: nickname || 'Anonymous'
  };

  // 產生簽章（最後再放入）
  params.CheckMacValue = generateCheckMacValue(params);
  
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
app.post('/admin/goal', requireAdmin, (req, res) => {
  const { title, amount } = req.body;
  const db = readDB();
  
  db.goal = {
    title: title || db.goal.title,
    amount: Number(amount) || db.goal.amount
  };
  
  writeDB(db);
  broadcastProgress();
  
  res.json({ success: true, goal: db.goal });
});

app.post('/admin/reset', requireAdmin, (req, res) => {
  const db = readDB();
  db.total = 0;
  db.donations = [];
  db.seenTradeNos = [];
  
  writeDB(db);
  broadcastProgress();
  
  res.json({ success: true });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 DonationBar server running on port ${port}`);
  console.log(`📊 Overlay URL: http://localhost:${port}/overlay`);
  console.log(`💰 Donation page: http://localhost:${port}/donate`);
  console.log(`⚙️  Admin panel: http://localhost:${port}/admin`);
});
