import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';

const app = express();
const __dirname = path.resolve();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const DB_PATH = path.join(__dirname, 'db.json');

// Database helpers
function readDB() { 
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); 
  } catch (error) {
    console.error('Error reading database:', error);
    return { goal: { title: "Goal", amount: 10000, start: "", end: "" }, total: 0, donations: [], seenTradeNos: [] };
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
    start: db.goal.start,
    end: db.goal.end,
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

// ECPay CheckMacValue verification
function generateCheckMacValue(params) {
  // Sort parameters and create query string
  const sortedParams = Object.keys(params)
    .filter(key => key !== 'CheckMacValue')
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  const hashKey = process.env.HASH_KEY;
  const hashIV = process.env.HASH_IV;
  
  // ECPay algorithm: HashKey + query + HashIV
  const raw = `HashKey=${hashKey}&${sortedParams}&HashIV=${hashIV}`;
  const urlEncoded = encodeURIComponent(raw).toLowerCase();
  
  return crypto.createHash('sha256').update(urlEncoded).digest('hex').toUpperCase();
}

function verifyCheckMacValue(params) {
  if (!params.CheckMacValue) return false;
  
  const calculatedMac = generateCheckMacValue(params);
  return calculatedMac === params.CheckMacValue;
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
  res.sendFile(path.join(__dirname, 'public', 'donate.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ECPay callback endpoint
app.post('/ecpay/return', (req, res) => {
  const params = req.body;
  console.log('ECPay callback received:', params);

  // Verify the payment was successful
  if (params.RtnCode === '1' && verifyCheckMacValue(params)) {
    const success = addDonation({
      tradeNo: params.MerchantTradeNo,
      amount: params.TradeAmt,
      payer: params.CustomField1 || 'Anonymous'
    });
    
    if (success) {
      return res.send('1|OK');
    }
  }
  
  console.error('Payment verification failed:', params);
  return res.status(400).send('0|FAIL');
});

// Create ECPay order
app.post('/create-order', (req, res) => {
  const { amount, nickname } = req.body;
  
  if (!amount || amount < 1) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  
  const tradeNo = 'DONATE' + Date.now();
  const tradeDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const params = {
    MerchantID: process.env.MERCHANT_ID,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: Number(amount),
    TradeDesc: 'Stream Donation',
    ItemName: `Stream Support x1`,
    ReturnURL: `${process.env.BASE_URL}/ecpay/return`,
    ClientBackURL: `${process.env.BASE_URL}/donate?success=1`,
    OrderResultURL: `${process.env.BASE_URL}/donate?success=1`,
    ChoosePayment: 'Credit',
    EncryptType: 1,
    CustomField1: nickname || 'Anonymous'
  };
  
  // Generate CheckMacValue
  const checkMacValue = generateCheckMacValue(params);
  params.CheckMacValue = checkMacValue;
  
  // Create auto-submit form
  const action = process.env.ENVIRONMENT === 'production' 
    ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
    : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
  
  const inputs = Object.entries(params)
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${String(value)}">`)
    .join('\n');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Redirecting to ECPay...</title>
      <style>
        body { font-family: system-ui; background: #0f1216; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; }
        .loading { text-align: center; }
        .spinner { border: 3px solid #333; border-top: 3px solid #46e65a; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="loading">
        <div class="spinner"></div>
        <p>Redirecting to ECPay payment gateway...</p>
      </div>
      <form id="ecpayForm" method="post" action="${action}">
        ${inputs}
      </form>
      <script>
        setTimeout(() => {
          document.getElementById('ecpayForm').submit();
        }, 1000);
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

// Admin API for goal management
app.post('/admin/goal', (req, res) => {
  const { title, amount, start, end } = req.body;
  const db = readDB();
  
  db.goal = {
    title: title || db.goal.title,
    amount: Number(amount) || db.goal.amount,
    start: start || db.goal.start,
    end: end || db.goal.end
  };
  
  writeDB(db);
  broadcastProgress();
  
  res.json({ success: true, goal: db.goal });
});

app.post('/admin/reset', (req, res) => {
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
