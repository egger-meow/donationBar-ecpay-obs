# 🧪 Subscription Testing Guide

> Complete testing methodology for ECPay subscription integration

---

## 📋 Test Environment Setup

### Option 1: Ngrok (Recommended for Testing)

```bash
# Install ngrok
# Windows: choco install ngrok
# Mac: brew install ngrok

# Start tunnel
ngrok http 3000

# Output example:
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

Update `.env`:
```env
BASE_URL=https://abc123.ngrok.io
```

### Option 2: Cloudflare Tunnel

```bash
# Install cloudflared
cloudflared tunnel --url http://localhost:3000
```

### ECPay Sandbox Credentials

```env
# Use these for sandbox testing (免費)
MERCHANT_ID=2000132
HASH_KEY=5294y06JbISpM5x9
HASH_IV=v77hoKGq4kWxNNIS
```

### Test Credit Card

| Field | Value |
|-------|-------|
| Card Number | `4311-9522-2222-2222` |
| Expiry | Any future date (e.g., `12/28`) |
| CVV | `222` |

---

## 🔬 Test Cases

### TC-001: New Subscription Flow

**Preconditions:**
- User logged in
- User has trial or free subscription

**Steps:**
1. Navigate to admin panel
2. Click "訂閱方案" button
3. Click "訂閱付費方案"
4. Complete ECPay payment with test card
5. Return to admin panel

**Expected Results:**
- [ ] Redirected to ECPay payment page
- [ ] After payment, subscription status = `active`
- [ ] `planType` = `pro` or `paid`
- [ ] Payment record in `payment_history` table
- [ ] Audit log entry created

**Verification:**
```bash
# Check subscription status
curl http://localhost:3000/api/subscription/status \
  -H "Cookie: connect.sid=YOUR_SESSION"

# Expected response
{
  "hasSubscription": true,
  "subscription": {
    "planType": "pro",
    "status": "active",
    "isTrial": false
  }
}
```

---

### TC-002: Monthly Payment Callback (PeriodReturnURL)

**Preconditions:**
- Active subscription exists
- ECPay sends monthly callback

**Simulation (Manual Test):**
```bash
# Create test payload (you'll need to encrypt properly)
# In sandbox, ECPay will automatically send test callbacks

# Monitor logs
tail -f server.log | grep "Period Callback"
```

**Expected Results:**
- [ ] Server responds with `1|OK`
- [ ] `payment_history` record created
- [ ] `lastPaymentDate` updated on subscription
- [ ] `lastPaymentStatus` = `success`

**Database Verification:**
```sql
-- Check latest payment
SELECT * FROM payment_history 
ORDER BY created_at DESC LIMIT 1;

-- Check subscription updated
SELECT last_payment_date, last_payment_status, failed_payment_count
FROM subscriptions WHERE user_id = 'YOUR_USER_ID';
```

---

### TC-003: Failed Payment Handling

**Preconditions:**
- Active subscription

**Simulation:**
```bash
# Simulate failed payment callback (modify test data)
# Or wait for ECPay to send failed callback with test declined card
```

**Expected Results:**
- [ ] `failedPaymentCount` incremented
- [ ] `gracePeriodEndAt` set (+7 days)
- [ ] `lastPaymentStatus` = `failed`
- [ ] Payment record with `status: failed`

**After 6 Failures:**
- [ ] Subscription `status` = `cancelled`
- [ ] Audit log shows auto-cancellation

---

### TC-004: Cancel Subscription

**Steps:**
```bash
curl -X POST http://localhost:3000/subscription/cancel \
  -H "Cookie: connect.sid=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

**Expected Results:**
- [ ] Response: `{ "success": true, "gracePeriodEnd": "..." }`
- [ ] Subscription `status` = `cancelled`
- [ ] `canceledAt` timestamp set
- [ ] User retains access until grace period end
- [ ] Audit log entry

---

### TC-005: Pause/Resume Subscription

**Pause:**
```bash
curl -X POST http://localhost:3000/subscription/pause \
  -H "Cookie: connect.sid=YOUR_SESSION"
```

**Expected:**
- [ ] Status = `paused`
- [ ] `pausedAt` timestamp set

**Resume:**
```bash
curl -X POST http://localhost:3000/subscription/resume \
  -H "Cookie: connect.sid=YOUR_SESSION"
```

**Expected:**
- [ ] Status = `active`
- [ ] `pausedAt` cleared

---

### TC-006: Payment History API

```bash
curl http://localhost:3000/api/subscription/payment-history \
  -H "Cookie: connect.sid=YOUR_SESSION"
```

**Expected Response:**
```json
{
  "success": true,
  "payments": [
    {
      "id": "uuid",
      "date": "2026-01-03T00:00:00Z",
      "amount": 70,
      "currency": "TWD",
      "status": "success",
      "paymentMethod": "Credit Card ****2222"
    }
  ]
}
```

---

### TC-007: CheckMacValue Verification

**Purpose:** Ensure security hash calculation is correct

**Test:**
```javascript
// In server.js, add logging to verify
console.log('Generated CheckMacValue:', checkMacValue);
console.log('Received CheckMacValue:', req.body.CheckMacValue);
```

**Verification:**
- [ ] Generated value matches ECPay documentation examples
- [ ] Callback verification passes
- [ ] Invalid checksums are rejected

---

### TC-008: Grace Period Access

**Scenario:** User's payment fails but should retain access

**Steps:**
1. Trigger failed payment
2. Verify `gracePeriodEndAt` is set
3. Check that user can still access paid features
4. Wait until grace period expires
5. Verify access is revoked

**Verification Points:**
- [ ] Grace period = 7 days from failure
- [ ] Access works during grace
- [ ] Access blocked after grace

---

## 🔄 End-to-End Test Script

```bash
#!/bin/bash
# e2e-subscription-test.sh

BASE_URL="http://localhost:3000"
SESSION_COOKIE="your-session-cookie"

echo "=== Subscription E2E Test ==="

# 1. Check initial status
echo "\n1. Checking initial status..."
curl -s "$BASE_URL/api/subscription/status" \
  -H "Cookie: connect.sid=$SESSION_COOKIE" | jq .

# 2. Get payment history
echo "\n2. Getting payment history..."
curl -s "$BASE_URL/api/subscription/payment-history" \
  -H "Cookie: connect.sid=$SESSION_COOKIE" | jq .

# 3. Test pause (if active)
echo "\n3. Testing pause..."
curl -s -X POST "$BASE_URL/subscription/pause" \
  -H "Cookie: connect.sid=$SESSION_COOKIE" | jq .

# 4. Test resume
echo "\n4. Testing resume..."
curl -s -X POST "$BASE_URL/subscription/resume" \
  -H "Cookie: connect.sid=$SESSION_COOKIE" | jq .

# 5. Final status check
echo "\n5. Final status..."
curl -s "$BASE_URL/api/subscription/status" \
  -H "Cookie: connect.sid=$SESSION_COOKIE" | jq .

echo "\n=== Test Complete ==="
```

---

## 📊 Database Test Queries

```sql
-- ===================================
-- Subscription Status Check
-- ===================================
SELECT 
  s.id,
  u.email,
  s.plan_type,
  s.status,
  s.is_trial,
  s.trial_end_date,
  s.last_payment_status,
  s.failed_payment_count,
  s.grace_period_end_at
FROM subscriptions s
JOIN users u ON s.user_id = u.id
ORDER BY s.updated_at DESC
LIMIT 10;

-- ===================================
-- Payment History Review
-- ===================================
SELECT 
  ph.created_at,
  ph.amount,
  ph.status,
  ph.ecpay_trade_no,
  ph.card_last4,
  ph.error_message
FROM payment_history ph
ORDER BY ph.created_at DESC
LIMIT 20;

-- ===================================
-- Failed Payments Requiring Attention
-- ===================================
SELECT 
  s.user_id,
  u.email,
  s.failed_payment_count,
  s.last_failed_at,
  s.grace_period_end_at
FROM subscriptions s
JOIN users u ON s.user_id = u.id
WHERE s.failed_payment_count > 0
ORDER BY s.failed_payment_count DESC;

-- ===================================
-- Subscription Overview (View)
-- ===================================
SELECT * FROM subscription_overview;
```

---

## ⚠️ Common Test Issues

### Issue 1: Callback Not Received

**Symptoms:** ECPay payment succeeds but no callback

**Checklist:**
- [ ] BASE_URL is HTTPS (ngrok)
- [ ] Ngrok tunnel is running
- [ ] Server is accessible from internet
- [ ] No firewall blocking

**Debug:**
```bash
# Test endpoint is reachable
curl -X POST https://your-ngrok-url.ngrok.io/ecpay/period/callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "test=1"
```

### Issue 2: CheckMacValue Mismatch

**Symptoms:** "CheckMacValue verification failed" in logs

**Checklist:**
- [ ] Correct HashKey/HashIV
- [ ] URL encoding matches ECPay spec
- [ ] Parameters sorted alphabetically
- [ ] Using SHA256 (not SHA1)

### Issue 3: Decryption Failed

**Symptoms:** "Failed to decrypt ECPay data" in logs

**Checklist:**
- [ ] HashKey/HashIV are correct
- [ ] AES-128-CBC algorithm
- [ ] Base64 decoding before decrypt
- [ ] Proper padding handling

### Issue 4: Session Lost After ECPay Return

**Symptoms:** User logged out after payment

**Checklist:**
- [ ] Session cookie `SameSite` setting
- [ ] CORS configuration
- [ ] Cookie secure flag matches protocol

---

## 📝 Test Report Template

```markdown
# Subscription Test Report

**Date:** YYYY-MM-DD
**Tester:** Name
**Environment:** Sandbox / Production

## Test Results

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-001 New Subscription | ✅/❌ | |
| TC-002 Monthly Callback | ✅/❌ | |
| TC-003 Failed Payment | ✅/❌ | |
| TC-004 Cancel | ✅/❌ | |
| TC-005 Pause/Resume | ✅/❌ | |
| TC-006 Payment History | ✅/❌ | |
| TC-007 CheckMacValue | ✅/❌ | |
| TC-008 Grace Period | ✅/❌ | |

## Issues Found

1. Issue description
   - Steps to reproduce
   - Expected vs Actual
   - Severity

## Sign-off

- [ ] All critical tests passed
- [ ] Ready for production
```

---

## 🔗 Related Documents

- [SUBSCRIPTION_ROADMAP.md](./SUBSCRIPTION_ROADMAP.md) - Overall development plan
- [SUBSCRIPTION_IMPLEMENTATION.md](./SUBSCRIPTION_IMPLEMENTATION.md) - Technical implementation
- [ECPAY_REQUIREMENTS.md](./ECPAY_REQUIREMENTS.md) - ECPay integration requirements
