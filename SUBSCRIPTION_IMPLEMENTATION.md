# 📋 Subscription System Implementation - Week 1 & 2

## ✅ Implementation Complete

This document details the ECPay periodic payment (subscription) implementation based on the official ECPay documentation.

---

## 🎯 What Was Implemented

### **Week 1: Database & Core Infrastructure** ✅

#### 1. Database Migration (`migrations/add-subscription-payment-system.sql`)
- ✅ Added ECPay tracking fields to `subscriptions` table:
  - `ecpay_merchant_trade_no` - Initial subscription order ID
  - `ecpay_trade_no` - ECPay transaction ID
  - `last_payment_date` - Most recent payment timestamp
  - `last_payment_status` - success/failed/pending
  - `failed_payment_count` - Consecutive failures
  - `last_failed_at` - Timestamp of last failure
  - `paused_at` - When subscription was paused
  - `grace_period_end_at` - Access grace period

- ✅ Created `payment_history` table with full ECPay support:
  - Transaction details (amount, currency, status)
  - ECPay trade numbers and payment dates
  - Card information (auth code, last 4 digits, bank)
  - Error tracking (message, code, retry count)
  - Periodic payment metadata
  - Invoice information (for future integration)

- ✅ Added indexes for performance optimization
- ✅ Created `subscription_overview` view for easy monitoring
- ✅ Auto-update triggers for timestamps

#### 2. Database Methods (`database.js`)
- ✅ `createPaymentRecord()` - Store payment transactions
- ✅ `getPaymentHistory()` - Get subscription payment history
- ✅ `getUserPaymentHistory()` - Get user's all payments
- ✅ `updatePaymentRecord()` - Update payment status
- ✅ `getFailedPaymentsForRetry()` - Retry failed payments

#### 3. Environment Configuration
Added to `.env`:
```env
SUBSCRIPTION_MONTHLY_PRICE=70
SUBSCRIPTION_TRIAL_DAYS=30
BASE_URL=https://your-domain.com  # MUST be HTTPS for production
```

---

### **Week 2: Subscription Endpoints** ✅

#### 1. `POST /subscription/checkout` ✅
**Purpose:** Create ECPay periodic payment authorization

**ECPay Parameters Implemented:**
- `PeriodAmount`: Monthly subscription price (NT$70)
- `PeriodType`: 'M' (Monthly recurring)
- `Frequency`: 1 (Every 1 month)
- `ExecTimes`: 999 (Unlimited until cancelled)
- `PeriodReturnURL`: `/ecpay/period/callback`

**Flow:**
1. Validates user authentication
2. Checks existing subscription status
3. Creates subscription record in database
4. Generates ECPay CheckMacValue
5. Redirects user to ECPay payment page
6. First payment triggers `/ecpay/return`
7. Subsequent payments trigger `/ecpay/period/callback`

**Test Command:**
```bash
curl -X POST http://localhost:3000/subscription/checkout \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json"
```

---

#### 2. `POST /ecpay/period/callback` ⚠️ **CRITICAL** ✅
**Purpose:** Receive monthly recurring charge notifications from ECPay

**Implements ECPay Spec:**
- Accepts encrypted JSON payload via `Data` field
- Decrypts using AES-128-CBC with workspace HashKey/HashIV
- Parses `OrderInfo` and `CardInfo` objects
- Verifies `RtnCode` (1 = success)
- **MUST respond with `"1|OK"`**

**Handles:**
- ✅ Successful payments → Update subscription status
- ✅ Failed payments → Increment failure count, set grace period
- ✅ Auto-cancellation after 6 failures (per ECPay docs)
- ✅ Full payment history tracking
- ✅ Card information storage
- ✅ Audit logging

**ECPay Behavior:**
- Called from **2nd payment onwards** (1st goes to ReturnURL)
- Retries if not acknowledged properly
- Stops after 6 consecutive failures

**Response Format (Required by ECPay):**
```
1|OK
```

---

#### 3. `GET /api/subscription/payment-history` ✅
**Purpose:** Get user's payment transaction history

**Returns:**
```json
{
  "success": true,
  "payments": [
    {
      "id": "uuid",
      "date": "2025-11-19T00:00:00Z",
      "amount": 70,
      "currency": "TWD",
      "status": "success",
      "paymentMethod": "Credit Card ****1234",
      "ecpayTradeNo": "202511190001",
      "invoiceNumber": null,
      "invoiceUrl": null
    }
  ]
}
```

---

#### 4. `POST /subscription/cancel` ✅
**Purpose:** Cancel active subscription

**Features:**
- ✅ Sets status to 'cancelled'
- ✅ Preserves access until end of billing cycle (grace period)
- ✅ Logs cancellation in audit trail
- ✅ Prevents duplicate cancellations

**Response:**
```json
{
  "success": true,
  "message": "Subscription cancelled successfully",
  "gracePeriodEnd": "2025-12-19T00:00:00Z"
}
```

**Note:** ECPay will automatically stop sending charges after status is cancelled.

---

#### 5. `POST /subscription/pause` ✅
**Purpose:** Temporarily pause subscription

**Use Cases:**
- User on vacation
- Temporary financial constraints
- Service quality issues

**Response:**
```json
{
  "success": true,
  "message": "Subscription paused successfully"
}
```

---

#### 6. `POST /subscription/resume` ✅
**Purpose:** Resume a paused subscription

**Response:**
```json
{
  "success": true,
  "message": "Subscription resumed successfully"
}
```

---

#### 7. `GET /api/subscription/status` ✅
**Purpose:** Get current subscription status

**Returns Full Subscription Details:**
```json
{
  "hasSubscription": true,
  "subscription": {
    "id": "uuid",
    "planType": "pro",
    "status": "active",
    "pricePerMonth": 70,
    "currency": "TWD",
    "isTrial": false,
    "trialEndDate": null,
    "billingCycleStart": "2025-11-19T00:00:00Z",
    "nextBillingDate": "2025-12-19T00:00:00Z",
    "lastPaymentDate": "2025-11-19T00:00:00Z",
    "lastPaymentStatus": "success",
    "failedPaymentCount": 0,
    "gracePeriodEndAt": null,
    "pausedAt": null,
    "canceledAt": null,
    "createdAt": "2025-11-19T00:00:00Z"
  }
}
```

---

## 🧪 Testing Guide

### **Prerequisites**
1. **ECPay Test Account:**
   - Register at https://developers.ecpay.com.tw/
   - Use test credentials:
     - MerchantID: `2000132`
     - HashKey: `5294y06JbISpM5x9`
     - HashIV: `v77hoKGq4kWxNNIS`

2. **Test Credit Card:**
   - Card Number: `4311-9522-2222-2222`
   - Expiry: Any future date
   - CVV: `222`

3. **HTTPS Requirement:**
   - For production: MUST use HTTPS
   - For local testing: Use ngrok or similar
   ```bash
   ngrok http 3000
   ```

---

### **Test Scenarios**

#### **Scenario 1: New Subscription (Trial → Paid)** ✅
```bash
# 1. User signs up with trial
POST /auth/signup
Body: { "email": "test@example.com", "password": "password123" }

# 2. User upgrades to paid
POST /subscription/checkout
# → Redirects to ECPay test environment
# → Use test card to complete payment

# 3. Verify first payment (goes to /ecpay/return)
# ECPay will POST to your ReturnURL

# 4. Check subscription status
GET /api/subscription/status

# 5. Simulate 2nd month payment (manual testing)
# In production, ECPay will automatically send to /ecpay/period/callback after 1 month
```

#### **Scenario 2: Failed Payment Handling** ✅
```bash
# 1. Wait for monthly charge (or simulate)
# POST /ecpay/period/callback with failed status

# 2. Check subscription status
GET /api/subscription/status
# Should show:
# - lastPaymentStatus: "failed"
# - failedPaymentCount: 1
# - gracePeriodEndAt: +7 days

# 3. After 6 failures
# - Subscription automatically cancelled
# - Status: "cancelled"
```

#### **Scenario 3: Subscription Management** ✅
```bash
# Cancel subscription
POST /subscription/cancel

# Pause subscription
POST /subscription/pause

# Resume subscription
POST /subscription/resume

# View payment history
GET /api/subscription/payment-history
```

---

## 🔧 Configuration for Production

### **1. Update Environment Variables**
```env
# Production ECPay credentials (get from ECPay merchant account)
MERCHANT_ID=your_production_merchant_id
HASH_KEY=your_production_hash_key
HASH_IV=your_production_hash_iv

# MUST be HTTPS
BASE_URL=https://your-domain.com

# Subscription settings
SUBSCRIPTION_MONTHLY_PRICE=70
SUBSCRIPTION_TRIAL_DAYS=30

# Email notifications (for dunning system - Week 3-4)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### **2. Update ECPay Endpoint**
In `server.js` line 1656, change:
```javascript
// Testing
const action = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

// Production
const action = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
```

### **3. Setup ECPay Merchant Backend**
Log into https://vendor.ecpay.com.tw/ and configure:
- **ReturnURL:** `https://your-domain.com/ecpay/return`
- **PeriodReturnURL:** `https://your-domain.com/ecpay/period/callback`
- Enable 信用卡定期定額 feature

### **4. Run Database Migration**
```bash
# For PostgreSQL
npm run migrate

# Or manually run SQL
psql $DATABASE_URL -f migrations/add-subscription-payment-system.sql
```

---

## 📊 Database Schema Changes

### **Subscriptions Table Extensions**
```sql
ALTER TABLE subscriptions ADD COLUMN ecpay_merchant_trade_no VARCHAR(255);
ALTER TABLE subscriptions ADD COLUMN ecpay_trade_no VARCHAR(255);
ALTER TABLE subscriptions ADD COLUMN last_payment_date TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN last_payment_status VARCHAR(20);
ALTER TABLE subscriptions ADD COLUMN failed_payment_count INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN paused_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN grace_period_end_at TIMESTAMP;
```

### **New Payment History Table**
```sql
CREATE TABLE payment_history (
  id UUID PRIMARY KEY,
  subscription_id UUID NOT NULL,
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  status VARCHAR(20),  -- success/failed/pending
  ecpay_trade_no VARCHAR(255),
  ecpay_merchant_trade_no VARCHAR(255),
  card_last4 VARCHAR(4),
  issuing_bank VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMP,
  paid_at TIMESTAMP
);
```

---

## 🔐 Security Features Implemented

### **1. CheckMacValue Verification** ✅
- SHA256 hash verification for all ECPay callbacks
- Custom URL encoding per ECPay spec
- Prevents tampering and replay attacks

### **2. Data Encryption** ✅
- AES-128-CBC decryption for PeriodReturnURL payload
- Workspace-specific encryption keys
- Secure credential storage

### **3. Authentication** ✅
- All subscription endpoints require login
- Session-based authentication
- CSRF protection via express-session

### **4. Audit Logging** ✅
- All subscription actions logged
- Payment success/failure tracking
- User action history

---

## 📈 Monitoring & Observability

### **Key Metrics to Track**
1. **Subscription Churn Rate**
   ```sql
   SELECT COUNT(*) FROM subscriptions WHERE status = 'cancelled';
   ```

2. **Failed Payment Rate**
   ```sql
   SELECT 
     COUNT(CASE WHEN status = 'failed' THEN 1 END) * 100.0 / COUNT(*) 
   FROM payment_history;
   ```

3. **Monthly Recurring Revenue (MRR)**
   ```sql
   SELECT SUM(price_per_month) FROM subscriptions WHERE status = 'active';
   ```

4. **Grace Period Subscriptions**
   ```sql
   SELECT COUNT(*) FROM subscriptions 
   WHERE grace_period_end_at > NOW() AND last_payment_status = 'failed';
   ```

### **Log Patterns to Monitor**
- `✅ Subscription payment successful` - Successful charges
- `⚠️ Payment failed for subscription` - Failed charges requiring action
- `❌ Subscription cancelled after 6 failed payments` - Automatic cancellations
- `💰 ECPay Period Callback received` - All recurring payment attempts

---

## 🚨 Important Notes

### **ECPay Periodic Payment Behavior**
1. **First Payment:** Goes to `ReturnURL` (already implemented)
2. **2nd+ Payments:** Go to `PeriodReturnURL` ⚠️ **NEW**
3. **Response Required:** MUST return `1|OK` string
4. **Failure Handling:** Auto-stops after 6 failures
5. **Testing:** Use stage environment first

### **Production Checklist** ✅
- [ ] ECPay production account created
- [ ] 信用卡定期定額 feature enabled
- [ ] HTTPS domain configured
- [ ] SSL certificate installed
- [ ] Database migration applied
- [ ] Environment variables updated
- [ ] ECPay endpoint changed to production URL
- [ ] Webhook URLs configured in ECPay backend
- [ ] Test subscription completed successfully
- [ ] Monitoring alerts configured

---

## 🔜 Next Steps (Week 3-4)

### **Dunning System** (Not Yet Implemented)
- Email notifications for failed payments
- Automatic retry schedule (3, 7, 14 days)
- Update payment method flow
- Failed payment UI warnings

### **Invoice Integration** (Not Yet Implemented)
- ECPay Invoice API integration
- Auto-issue on successful payment
- Invoice download/email
- B2B tax ID support

### **Admin Features** (Not Yet Implemented)
- Subscription dashboard
- Manual payment retry
- Refund processing
- Revenue analytics

---

## 📞 Support & Troubleshooting

### **Common Issues**

**1. PeriodReturnURL not receiving notifications**
- ✅ Verify BASE_URL is HTTPS
- ✅ Check ECPay merchant backend configuration
- ✅ Ensure endpoint responds with `1|OK`
- ✅ Check server logs for decryption errors

**2. CheckMacValue verification fails**
- ✅ Verify HashKey/HashIV are correct
- ✅ Check URL encoding implementation
- ✅ Ensure all parameters are included
- ✅ Parameters must be sorted alphabetically

**3. Decryption fails**
- ✅ Verify HashKey/HashIV match ECPay account
- ✅ Check encryption algorithm (AES-128-CBC)
- ✅ Ensure Base64 decoding is correct

**4. Subscription not updating after payment**
- ✅ Check database connection
- ✅ Verify userId extraction from CustomField
- ✅ Check subscription record exists
- ✅ Review audit logs

---

## 📚 References

- ECPay Official Docs: https://developers.ecpay.com.tw/
- Periodic Payment API: https://developers.ecpay.com.tw/?p=2868
- PeriodReturnURL Spec: https://developers.ecpay.com.tw/?p=49193
- Test Environment: https://developers.ecpay.com.tw/?p=7398
- CheckMacValue: https://developers.ecpay.com.tw/?p=2902

---

## ✅ Summary

**Week 1-2 Implementation: COMPLETE** 🎉

- ✅ Database migration created
- ✅ Payment history tracking
- ✅ Subscription checkout flow
- ✅ PeriodReturnURL handler (CRITICAL)
- ✅ Cancel/Pause/Resume functionality
- ✅ Payment history API
- ✅ Status endpoint
- ✅ Full ECPay compliance
- ✅ Security features
- ✅ Audit logging

**Ready for Testing:** YES  
**Ready for Production:** After ECPay account setup & testing

**Estimated Time to Production:** 1-2 weeks (including ECPay approval time)
