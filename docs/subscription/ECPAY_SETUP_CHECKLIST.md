# ✅ ECPay Setup Checklist

> 審核通過後的設定步驟清單

---

## 🟡 等待中 - ECPay 帳號審核

**預計時間：** 3-5 工作日

**審核項目：**
- [x] 身分驗證
- [x] 銀行驗證
- [ ] 金流-非信用卡收款 (審核中)
- [ ] 金流-信用卡收款 (審核中)

---

## 📋 審核通過後立即執行

### Step 1: 取得正式憑證

登入 ECPay 商家後台: https://vendor.ecpay.com.tw/

取得以下資訊：
```
MERCHANT_ID = ________________
HASH_KEY    = ________________
HASH_IV     = ________________
```

### Step 2: 更新環境變數

編輯 `.env` 檔案：
```env
# ECPay 正式環境
MERCHANT_ID=你的特店編號
HASH_KEY=你的HashKey
HASH_IV=你的HashIV

# 確保 BASE_URL 是 HTTPS
BASE_URL=https://your-production-domain.com
```

### Step 3: ECPay 後台設定

在 ECPay 商家後台設定：

| 設定項目 | 值 |
|----------|-----|
| ReturnURL | `https://your-domain.com/ecpay/return` |
| PeriodReturnURL | `https://your-domain.com/ecpay/period/callback` |
| 信用卡定期定額 | ✅ 啟用 |

### Step 4: 切換到正式環境

修改 `server.js` (約 line 1656):
```javascript
// 從測試環境
const action = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

// 改為正式環境
const action = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
```

### Step 5: 執行資料庫遷移

```bash
npm run migrate
```

### Step 6: 驗證測試

1. **測試訂閱流程**
   - 登入系統
   - 點擊訂閱
   - 完成付款 (建議先用 NT$1 測試)
   - 確認回調正常

2. **檢查 Log**
   ```bash
   # 確認有看到
   ✅ Subscription payment successful
   💰 ECPay Period Callback received
   ```

3. **資料庫驗證**
   ```sql
   SELECT * FROM subscriptions WHERE status = 'active';
   SELECT * FROM payment_history ORDER BY created_at DESC LIMIT 5;
   ```

---

## 🧪 Sandbox 測試 (可先進行)

即使正式帳號還在審核，可以先用 Sandbox 測試：

```env
# Sandbox 測試憑證
MERCHANT_ID=2000132
HASH_KEY=5294y06JbISpM5x9
HASH_IV=v77hoKGq4kWxNNIS
```

**測試卡號：** `4311-9522-2222-2222` / CVV: `222`

---

## 📞 ECPay 技術支援

- **客服電話：** 02-2655-0115
- **技術文件：** https://developers.ecpay.com.tw/
- **商家後台：** https://vendor.ecpay.com.tw/

---

## ⚠️ 重要提醒

1. **HTTPS 必須** - Production 環境所有回調 URL 必須是 HTTPS
2. **回應格式** - PeriodReturnURL 必須回應 `1|OK`
3. **5秒限制** - 回調必須在 5 秒內回應
4. **6次失敗** - ECPay 會在 6 次扣款失敗後自動停止

---

*建立時間: 2026-01-03*
*狀態: 等待 ECPay 審核通過*
