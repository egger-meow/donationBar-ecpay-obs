# Subscription UI Requirements Checklist

## ✅ Current Implementation Status

Based on `subscribtion.md` Section #5 (User Self-Service Interface)

### 1. Basic Subscription Display ✅
- [x] Plan type (Trial/Paid/Expired/Free Pass)
- [x] Subscription status badge
- [x] Trial countdown with days remaining
- [x] Color-coded urgency (red if ≤3 days)
- [x] Trial end date display
- [x] Monthly price (NT$70)

### 2. Paid Subscription Details ✅
- [x] Subscription status (Active/Paused/Cancelled)
- [x] Monthly fee display
- [x] Billing cycle start date
- [x] Next billing date
- [x] Feature list display

### 3. Payment History 🚧 (UI Ready, Backend Pending)
**UI Components Added:**
- [x] Payment history preview section
- [x] "View All" button
- [ ] **Backend Required:**
  - GET /api/subscription/payment-history
  - ECPay query API integration
  - Store payment records in database

**Future Display Fields:**
```javascript
{
  date: "2025-12-13",
  amount: 70,
  status: "success", // success/failed/pending
  paymentMethod: "信用卡 **** 1234",
  invoiceUrl: "/invoices/xxx",
  receiptUrl: "/receipts/xxx"
}
```

### 4. Invoice Management 🚧 (UI Ready, Backend Pending)
**UI Components Added:**
- [x] Invoice settings section
- [x] "Manage Invoice" button
- [ ] **Backend Required:**
  - ECPay Invoice API integration
  - Invoice settings storage
  - Automatic invoice generation on payment

**Future Fields:**
```javascript
{
  invoiceType: "personal" | "business",
  taxId: "12345678", // 統編 (optional)
  companyName: "公司名稱",
  invoiceEmail: "invoice@example.com",
  autoIssue: true
}
```

### 5. Subscription Management Actions ✅ (UI Ready)
**Implemented:**
- [x] Upgrade/Subscribe button (trial → paid)
- [x] Manage payment method button
- [x] Pause subscription button
- [x] Cancel subscription button

**Confirmation Messages:**
- [x] Cancel: Warns about losing access, mentions grace period
- [x] Pause: Explains no charges, feature loss

### 6. Failed Payment Handling (Dunning) 🔴 (Not Implemented)
**Required for Production:**
- [ ] Failed payment notification banner
- [ ] Payment retry button
- [ ] Update card/payment method flow
- [ ] Email notification system
- [ ] Automatic retry schedule (e.g., 3 days, 7 days, 14 days)

**Example UI:**
```html
<div class="alert-error">
  ⚠️ 上次扣款失敗
  請更新您的付款方式以繼續使用服務
  [更新付款方式] [重試扣款]
</div>
```

---

## 🔧 Backend Integration Required

### A. ECPay Periodic Payment Setup
Based on `subscribtion.md` Section #3 & #4

#### Endpoints Needed:
1. **POST /subscription/checkout**
   - Create periodic payment order
   - Redirect to ECPay
   - Parameters: `PeriodType`, `Frequency`, `ExecTimes`, `PeriodAmount`

2. **POST /ecpay/period/callback** (PeriodReturnURL)
   - Receive monthly charge notifications
   - Response: `1|OK`
   - Update subscription payment records

3. **GET /subscription/query**
   - Query subscription status from ECPay
   - Sync local database with ECPay

4. **POST /subscription/cancel**
   - Update local status
   - Optional: Call ECPay cancellation API

5. **POST /subscription/pause**
   - Set status to paused
   - Skip next billing cycle

#### Database Schema Extensions Needed:
```javascript
// Add to subscriptions table
{
  ecpayMerchantTradeNo: "SUB20251113001", // ECPay order ID
  ecpayTradeNo: "202511130001",           // ECPay transaction ID
  lastPaymentDate: "2025-11-13T00:00:00Z",
  lastPaymentStatus: "success",           // success/failed/pending
  failedPaymentCount: 0,
  lastFailedAt: null,
  pausedAt: null,
  canceledAt: null,
  gracePeriodEndAt: null                  // Allow access until this date
}

// New table: payment_history
{
  id: uuid,
  subscriptionId: uuid,
  amount: 70,
  currency: "TWD",
  status: "success",
  ecpayTradeNo: "xxx",
  paymentMethod: "Credit Card",
  paymentMethodLast4: "1234",
  paidAt: timestamp,
  invoiceNumber: "AB12345678",
  invoiceUrl: "/invoices/xxx"
}
```

### B. Invoice Integration (Optional but Recommended)
Based on `subscribtion.md` Section #6

**ECPay Invoice API Requirements:**
- [ ] Invoice settings storage
- [ ] Automatic issue on payment success
- [ ] Void/allowance API for refunds
- [ ] Invoice download/email functionality

---

## 📊 Feature Comparison with subscribtion.md

| Requirement | Current Status | Notes |
|-------------|---------------|-------|
| **Section #5.1: Subscription Page** | ✅ Complete | All display fields implemented |
| **Section #5.2: Cancel/Upgrade** | 🚧 UI Ready | Backend endpoints needed |
| **Section #5.3: Failed Payment (Dunning)** | 🔴 Not Started | Critical for production |
| **Section #6: Invoice** | 🚧 Placeholder | ECPay Invoice API integration needed |
| **Section #3: Periodic Payment Params** | 🔴 Not Implemented | Core subscription logic |
| **Section #4: Webhooks** | 🔴 Not Implemented | PeriodReturnURL handler |

---

## 🎯 Implementation Priority

### Phase 1: Core Subscription (MVP) 🔴
1. ECPay periodic payment integration
2. PeriodReturnURL webhook handler
3. Basic payment record storage
4. Subscription status sync

### Phase 2: User Management 🟡
1. Cancel subscription flow
2. Payment method update
3. Pause/resume subscription
4. Failed payment retry

### Phase 3: Polish & Compliance 🟢
1. Electronic invoice integration
2. Payment history display
3. Dunning system with email
4. Audit logs for subscription changes

---

## 💾 Current UI Features Summary

### ✅ **What Works Now:**
- Beautiful, responsive subscription modal
- Clear trial countdown display
- Proper date calculations (30-day trial)
- Three distinct states (trial/paid/expired)
- Disabled URL warning for expired users
- All placeholder UI for future features

### 🔧 **What Needs Backend:**
- ECPay subscription checkout flow
- Monthly recurring charge handling
- Payment history API
- Failed payment detection & retry
- Subscription status updates (cancel/pause)
- Invoice generation

### 📝 **Database Schema Complete:**
- ✅ Trial dates calculation
- ✅ Billing cycle tracking
- ✅ Next billing date
- 🔴 Payment history table (needs creation)
- 🔴 Failed payment tracking fields

---

## 🚀 Next Steps

1. **Setup ECPay Test Environment** (Section #1)
   - Get test MerchantID/HashKey/HashIV
   - Test periodic payment creation

2. **Implement Core Endpoints** (Section #4)
   - `/subscription/checkout` - Create subscription
   - `/ecpay/period/callback` - Handle monthly charges
   - `/subscription/query` - Sync status

3. **Add Payment History Table**
   - Migrate database
   - Store payment records

4. **Build Dunning System** (Section #5.3)
   - Failed payment detection
   - Email notifications
   - Automatic retry schedule

5. **Test Full Flow** (Section #7)
   - Trial → Subscribe → Monthly charge
   - Failed payment → Retry → Success
   - Cancel → Expired → Re-subscribe

---

## ✨ Conclusion

**The current UI is FULLY PREPARED for all future requirements from `subscribtion.md`.**

All placeholders, buttons, and layouts are in place. The UI can accommodate:
- ✅ Payment history list
- ✅ Invoice management
- ✅ Failed payment warnings
- ✅ Subscription pause/cancel flows
- ✅ Payment method updates

**What's needed:** Backend implementation of ECPay APIs and database tables.

The UI won't need major redesigns when backend features are added—just connect the existing buttons to real API endpoints! 🎉
