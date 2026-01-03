# 🗺️ Subscription Feature Roadmap

> **Last Updated:** 2026-01-03  
> **Status:** Phase 2 - ECPay Integration (Pending Account Approval)  
> **ECPay Account:** 🟡 審核中 (3-5 工作日)

---

## 📊 Current Development Status

### ECPay 帳號申請狀態

| 功能 | 狀態 | 預計時間 |
|------|------|----------|
| 金流-非信用卡收款 | 🟡 審核中 | 3-5 工作日 |
| 金流-信用卡收款 | 🟡 審核中 | 3-5 工作日 |
| 身分驗證 | ✅ 完成 | - |
| 銀行驗證 | ✅ 完成 | - |

**審核通過後需取得：**
- `MERCHANT_ID` - 特店編號
- `HASH_KEY` - 加密金鑰
- `HASH_IV` - 加密向量

---

## ✅ Completed Features (Phase 1)

### Database Infrastructure
| Component | Status | File |
|-----------|--------|------|
| Payment History Table | ✅ | `migrations/add-subscription-payment-system.sql` |
| ECPay Tracking Fields | ✅ | Added to `subscriptions` table |
| Payment Indexes | ✅ | For query performance |
| Subscription Overview View | ✅ | SQL view for monitoring |
| Auto-update Triggers | ✅ | `updated_at` timestamps |

### Database Methods (`database.js`)
| Method | Status | Description |
|--------|--------|-------------|
| `createPaymentRecord()` | ✅ | Store payment transactions |
| `getPaymentHistory()` | ✅ | Get subscription payment history |
| `getUserPaymentHistory()` | ✅ | Get user's all payments |
| `updatePaymentRecord()` | ✅ | Update payment status |
| `getFailedPaymentsForRetry()` | ✅ | Retry failed payments |

### API Endpoints (`server.js`)
| Endpoint | Status | Line | Purpose |
|----------|--------|------|---------|
| `POST /subscription/checkout` | ✅ | 1586 | Create ECPay subscription |
| `POST /ecpay/period/callback` | ✅ | 1711 | Receive monthly charges |
| `GET /api/subscription/payment-history` | ✅ | 1856 | Get payment history |
| `POST /subscription/cancel` | ✅ | 1890 | Cancel subscription |
| `POST /subscription/pause` | ✅ | 1945 | Pause subscription |
| `POST /subscription/resume` | ✅ | 1993 | Resume subscription |
| `GET /api/subscription/status` | ✅ | 2039 | Get subscription status |

### Security Features
| Feature | Status | Description |
|---------|--------|-------------|
| CheckMacValue Verification | ✅ | SHA256 hash for ECPay callbacks |
| AES-128-CBC Decryption | ✅ | For PeriodReturnURL payload |
| Session Authentication | ✅ | All endpoints require login |
| Audit Logging | ✅ | All actions logged |

---

## 🚧 Phase 2: ECPay Integration (Current)

### Blockers
- ⏳ **ECPay 帳號審核中** - 需等待 3-5 工作日

### Pending Configuration
```env
# .env - 待審核通過後填入
MERCHANT_ID=         # ⏳ 待取得
HASH_KEY=            # ⏳ 待取得  
HASH_IV=             # ⏳ 待取得
BASE_URL=https://your-domain.com  # ⚠️ Production 必須 HTTPS
```

### Pre-Approval Tasks (可先進行)

| Task | Status | Priority |
|------|--------|----------|
| 測試環境設定 (ngrok/cloudflare tunnel) | 🔲 | High |
| Admin UI 訂閱管理介面 | 🔲 | High |
| 付款失敗 UI 警示 | 🔲 | Medium |
| Email 通知系統 | 🔲 | Medium |

---

## 📅 Development Timeline

```
Week 0 (Current)
├── ✅ Database migration created
├── ✅ All subscription endpoints implemented
├── ✅ ECPay integration code complete
├── 🟡 ECPay account under review (3-5 days)
└── 🔲 Setup test environment (ngrok)

Week 1 (After ECPay Approval)
├── 🔲 Configure production ECPay credentials
├── 🔲 Test with sandbox environment
├── 🔲 Verify CheckMacValue calculation
├── 🔲 Test PeriodReturnURL callback
└── 🔲 Complete subscription flow test

Week 2
├── 🔲 Admin subscription dashboard UI
├── 🔲 Payment history UI in admin panel
├── 🔲 Dunning system (failed payment handling)
└── 🔲 Email notifications

Week 3
├── 🔲 Invoice integration (optional)
├── 🔲 Production deployment
├── 🔲 Monitoring & alerts setup
└── 🔲 Go-live!
```

---

## 🧪 Testing Methodology

### Phase A: Local Development Testing (Now)

#### 1. Mock ECPay Callbacks
```bash
# Simulate successful payment callback
curl -X POST http://localhost:3000/ecpay/period/callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Data=MOCK_ENCRYPTED_DATA"

# Check subscription status
curl http://localhost:3000/api/subscription/status \
  -H "Cookie: connect.sid=YOUR_SESSION"
```

#### 2. Database Verification
```sql
-- Check subscription status
SELECT * FROM subscriptions WHERE user_id = 'YOUR_USER_ID';

-- Check payment history
SELECT * FROM payment_history ORDER BY created_at DESC LIMIT 10;

-- View subscription overview
SELECT * FROM subscription_overview;
```

### Phase B: Sandbox Testing (After ECPay Approval)

#### Prerequisites
1. **Ngrok Setup** (for HTTPS callbacks)
   ```bash
   ngrok http 3000
   # Copy the https URL to .env BASE_URL
   ```

2. **Test Credentials** (ECPay Sandbox)
   ```env
   MERCHANT_ID=2000132
   HASH_KEY=5294y06JbISpM5x9
   HASH_IV=v77hoKGq4kWxNNIS
   ```

3. **Test Credit Card**
   - Number: `4311-9522-2222-2222`
   - Expiry: Any future date
   - CVV: `222`

#### Test Scenarios

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | 新用戶訂閱 | Login → Checkout → Pay | Status: `active`, `planType: pro` |
| 2 | 第二期扣款 | Wait for ECPay callback | Payment history updated |
| 3 | 付款失敗 | Use declined card | `failedPaymentCount++`, grace period set |
| 4 | 取消訂閱 | POST /subscription/cancel | Status: `cancelled`, access until billing end |
| 5 | 暫停/恢復 | Pause → Resume | Status toggles correctly |
| 6 | 6次失敗自動取消 | Simulate 6 failures | Auto-cancelled |

### Phase C: Production Testing

#### Checklist
- [ ] Switch to production ECPay URL
- [ ] Update credentials to production values
- [ ] Test with real NT$1 payment
- [ ] Verify callback URLs work
- [ ] Check audit logs
- [ ] Monitor for 24 hours

---

## 🚀 Deployment (落地) Plan

### Stage 1: Pre-Deployment Preparation

#### Environment Setup
```bash
# 1. Set production environment variables
export NODE_ENV=production
export ENVIRONMENT=production
export BASE_URL=https://your-domain.com

# 2. ECPay Production Credentials (待審核通過)
export MERCHANT_ID=your_production_merchant_id
export HASH_KEY=your_production_hash_key
export HASH_IV=your_production_hash_iv

# 3. Database
export DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

#### Server Configuration Changes
```javascript
// server.js line ~1656 - Change ECPay endpoint
// FROM (Sandbox):
const action = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

// TO (Production):
const action = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
```

### Stage 2: Database Migration

```bash
# Run migration
npm run migrate

# Or manually
psql $DATABASE_URL -f migrations/add-subscription-payment-system.sql

# Verify
psql $DATABASE_URL -c "SELECT * FROM payment_history LIMIT 1;"
```

### Stage 3: ECPay Backend Configuration

Login to https://vendor.ecpay.com.tw/ and configure:

| Setting | Value |
|---------|-------|
| ReturnURL | `https://your-domain.com/ecpay/return` |
| PeriodReturnURL | `https://your-domain.com/ecpay/period/callback` |
| 信用卡定期定額 | ✅ 啟用 |

### Stage 4: Go-Live Checklist

#### Technical Checklist
- [ ] HTTPS certificate valid
- [ ] Database migration applied
- [ ] Production ECPay credentials configured
- [ ] ECPay endpoint changed to production
- [ ] Webhook URLs configured in ECPay backend
- [ ] Test payment successful (NT$1)
- [ ] PeriodReturnURL responding `1|OK`
- [ ] Monitoring/logging enabled

#### Business Checklist
- [ ] Pricing confirmed (NT$70/month)
- [ ] Trial period configured (30 days)
- [ ] Terms of service updated
- [ ] Privacy policy updated
- [ ] Refund policy defined

### Stage 5: Post-Launch Monitoring

#### Key Metrics
```sql
-- Active subscribers
SELECT COUNT(*) FROM subscriptions WHERE status = 'active';

-- Monthly Recurring Revenue
SELECT SUM(price_per_month) as MRR FROM subscriptions WHERE status = 'active';

-- Failed payment rate
SELECT 
  COUNT(CASE WHEN status = 'failed' THEN 1 END) * 100.0 / COUNT(*) as fail_rate
FROM payment_history WHERE created_at > NOW() - INTERVAL '30 days';

-- Churn rate
SELECT COUNT(*) FROM subscriptions 
WHERE status = 'cancelled' AND canceled_at > NOW() - INTERVAL '30 days';
```

#### Log Patterns to Alert On
| Pattern | Severity | Action |
|---------|----------|--------|
| `⚠️ Payment failed` | Warning | Check after 3 failures |
| `❌ Subscription cancelled after 6` | Critical | Review user |
| `CheckMacValue verification failed` | Critical | Check credentials |
| `Decryption failed` | Critical | Check HashKey/IV |

---

## 🔜 Future Enhancements (Phase 3+)

### Dunning System (付款失敗處理)
- [ ] Email notification on failed payment
- [ ] Retry schedule: Day 3, 7, 14
- [ ] Update payment method flow
- [ ] Grace period UI warning

### Invoice Integration (電子發票)
- [ ] ECPay Invoice API
- [ ] Auto-issue on payment success
- [ ] B2B tax ID support
- [ ] Invoice download/email

### Admin Features
- [ ] Subscription management dashboard
- [ ] Manual payment retry
- [ ] Refund processing
- [ ] Revenue analytics
- [ ] Export to CSV

### User Features
- [ ] Plan upgrade/downgrade
- [ ] Payment method update
- [ ] Invoice history
- [ ] Subscription portal

---

## 📚 Reference Links

| Resource | URL |
|----------|-----|
| ECPay Developers | https://developers.ecpay.com.tw/ |
| 定期定額 API | https://developers.ecpay.com.tw/?p=2868 |
| PeriodReturnURL | https://developers.ecpay.com.tw/?p=49193 |
| 測試環境 | https://developers.ecpay.com.tw/?p=7398 |
| CheckMacValue | https://developers.ecpay.com.tw/?p=2902 |
| 定期定額查詢 | https://developers.ecpay.com.tw/?p=9093 |
| 電子發票 | https://www.ecpay.com.tw/Business/invoice_Document |

---

## 📝 Notes

### ECPay 定期定額行為
1. **第一期付款** → 走 `ReturnURL` (已實作)
2. **第二期起** → 走 `PeriodReturnURL` ⚠️ **重要**
3. **必須回應** `1|OK` 字串
4. **失敗處理** → 6 次失敗後自動停止
5. **測試環境** → 先用 stage 測試

### 已知限制
- ECPay 不支援美金，僅支援台幣
- 定期定額最少 NT$30
- 需要 HTTPS (production)
- PeriodReturnURL 必須 5 秒內回應

---

*Document maintained by development team. For questions, contact the project maintainer.*
