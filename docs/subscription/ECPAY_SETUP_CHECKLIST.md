# ✅ ECPay Setup Checklist

> 審核通過後的設定步驟清單。這份文件描述**平台自身**用於收取 DonationBar 訂閱費的
> ECPay 特約商店設定（對應 `.env` 中的 `BILLING_ECPAY_MERCHANT_ID` /
> `BILLING_ECPAY_HASH_KEY` / `BILLING_ECPAY_HASH_IV`），不是個別實況主用來收捐款的
> workspace ECPay 憑證（那組憑證存在資料庫的 `payment_providers` 表，由各實況主在
> Admin 後台自行輸入，詳見 [Complete Setup Guide](../setup/COMPLETE_SETUP_GUIDE.md)）。

*最後校對: 2026-07-11。以下審核狀態欄位建立於 2026-01-03，本檔案無法驗證目前真實審核進度 — 執行前請直接登入 ECPay 商家後台確認現況，不要假設本檔案的勾選狀態仍然正確。*

---

## 🟡 帳號審核狀態（建立時記錄，需自行重新確認）

**審核項目（2026-01-03 時的記錄）：**
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
BILLING_ECPAY_MERCHANT_ID = ________________
BILLING_ECPAY_HASH_KEY    = ________________
BILLING_ECPAY_HASH_IV     = ________________
```

### Step 2: 更新環境變數

編輯 `.env` 檔案：
```env
# ECPay 正式環境 — 平台自身用於收訂閱費的商店（不是實況主的收款憑證）
BILLING_ECPAY_MERCHANT_ID=你的特店編號
BILLING_ECPAY_HASH_KEY=你的HashKey
BILLING_ECPAY_HASH_IV=你的HashIV

# 切換 ECPay 端點為正式環境（見 config.js）
ECPAY_ENVIRONMENT=production

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

不需要修改 `server.js`。stage/production 端點的切換完全由 `.env` 的
`ECPAY_ENVIRONMENT` 決定（`stage` 或 `production`，見 `config.js`），Step 2 已經設定。
`validateProductionConfig()`（`config.js`）會在啟動時檢查這個值是合法選項，值錯誤時會
直接拒絕啟動。

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

   Log 現在是結構化 JSON（見 [Monitoring and Incident Response](../operations/MONITORING_AND_INCIDENT_RESPONSE.md)），確認有看到含以下 `event` 欄位的行：
   ```bash
   "event":"legacy_period_callback_received"
   "event":"legacy_subscription_payment_succeeded"
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
