# 📚 ECPay API 完整參考文件

> **來源：** ECPay 官方技術文件  
> **最後更新：** 2026-01-03  
> **用途：** 訂閱系統開發參考

---

## 📖 目錄

1. [測試環境資訊](#1-測試環境資訊)
2. [API 介接網址](#2-api-介接網址)
3. [信用卡定期定額 API](#3-信用卡定期定額-api)
4. [CheckMacValue 檢查碼機制](#4-checkmacvalue-檢查碼機制)
5. [PeriodReturnURL 定期扣款通知](#5-periodreturnurl-定期扣款通知)
6. [定期定額查詢 API](#6-定期定額查詢-api)
7. [介接注意事項](#7-介接注意事項)
8. [錯誤代碼](#8-錯誤代碼)

---

## 1. 測試環境資訊

> **來源：** https://developers.ecpay.com.tw/?p=7398

### Sandbox 測試憑證 (B2C)

| 項目 | 值 |
|------|-----|
| **MerchantID** | `2000132` |
| **HashKey** | `5294y06JbISpM5x9` |
| **HashIV** | `v77hoKGq4kWxNNIS` |
| 後台帳號 | `stagetest1234` |
| 後台密碼 | `test1234` |
| 統一編號 | `53538851` |

### 測試信用卡號

| 卡別 | 卡號 | CVV | 到期日 |
|------|------|-----|--------|
| VISA | `4311-9522-2222-2222` | `222` | 任意未來日期 |

### 環境變數設定 (開發用)

```env
# Sandbox 測試環境
MERCHANT_ID=2000132
HASH_KEY=5294y06JbISpM5x9
HASH_IV=v77hoKGq4kWxNNIS
```

---

## 2. API 介接網址

### 信用卡定期定額 (AioCheckOut)

| 環境 | URL |
|------|-----|
| **測試** | `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5` |
| **正式** | `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5` |

### 定期定額查詢

| 環境 | URL |
|------|-----|
| **測試** | `https://ecpayment-stage.ecpay.com.tw/1.0.0/Cashier/QueryTrade` |
| **正式** | `https://ecpayment.ecpay.com.tw/1.0.0/Cashier/QueryTrade` |

### HTTPS 傳輸協定

```
Content-Type: application/x-www-form-urlencoded  (AioCheckOut)
Content-Type: application/json                    (QueryTrade)
HTTP Method: POST
```

---

## 3. 信用卡定期定額 API

> **來源：** https://developers.ecpay.com.tw/?p=2868

### 應用場景

有定期收款需求時，且收款金額相同。消費者只需刷一次卡，之後綠界會依設定參數 (`PeriodType`, `Frequency`, `ExecTimes`) 定期做信用卡授權。

### 共同必填參數

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `MerchantID` | String(10) | ✅ | 特店編號 |
| `MerchantTradeNo` | String(20) | ✅ | 訂單編號 (唯一值，英數字混合) |
| `MerchantTradeDate` | String(20) | ✅ | 格式：`yyyy/MM/dd HH:mm:ss` |
| `PaymentType` | String(20) | ✅ | 固定填 `aio` |
| `TotalAmount` | Int | ✅ | 交易金額 (整數，新台幣) |
| `TradeDesc` | String(200) | ✅ | 交易描述 (勿帶特殊字元) |
| `ItemName` | String(400) | ✅ | 商品名稱 (多筆用 `#` 分隔) |
| `ReturnURL` | String(200) | ✅ | 付款結果通知 URL (Server 端) |
| `ChoosePayment` | String(20) | ✅ | 固定填 `Credit` |
| `CheckMacValue` | String | ✅ | 檢查碼 (見第4節) |
| `EncryptType` | Int | ✅ | 固定填 `1` (SHA256) |

### 定期定額專用參數

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `PeriodAmount` | Int | ✅ | 每次授權金額 (須與 `TotalAmount` 相同) |
| `PeriodType` | String(1) | ✅ | 週期種類：`D`=天, `M`=月, `Y`=年 |
| `Frequency` | Int | ✅ | 執行頻率 (見下方說明) |
| `ExecTimes` | Int | ✅ | 執行次數 (最少2次) |
| `PeriodReturnURL` | String(200) | 🔶 | 定期扣款結果通知 URL |

### Frequency 設定規則

| PeriodType | Frequency 範圍 | 說明 |
|------------|----------------|------|
| `D` (天) | 1~365 | 每幾天執行一次 |
| `M` (月) | 1~12 | 每幾月執行一次 |
| `Y` (年) | 1 | 每年執行一次 |

### ExecTimes 設定規則

| PeriodType | 最大次數 |
|------------|----------|
| `D` (天) | 999 |
| `M` (月) | 999 |
| `Y` (年) | 99 |

### 選填參數

| 參數 | 型別 | 說明 |
|------|------|------|
| `StoreID` | String(10) | 分店代號 |
| `ClientBackURL` | String(200) | 付款完成後返回按鈕連結 |
| `OrderResultURL` | String(200) | Client 端回傳付款結果 URL |
| `NeedExtraPaidInfo` | String(1) | 是否需要額外付款資訊 (`Y`/`N`) |
| `CustomField1~4` | String | 自訂欄位 (可存 userId 等) |

### 範例：建立月訂閱 (NT$70/月)

```javascript
const params = {
  MerchantID: '2000132',
  MerchantTradeNo: `SUB${Date.now()}`,
  MerchantTradeDate: '2026/01/03 18:00:00',
  PaymentType: 'aio',
  TotalAmount: 70,
  TradeDesc: 'Monthly Subscription',
  ItemName: 'Pro Plan - Monthly',
  ReturnURL: 'https://your-domain.com/ecpay/return',
  ChoosePayment: 'Credit',
  EncryptType: 1,
  
  // 定期定額參數
  PeriodAmount: 70,
  PeriodType: 'M',           // 月
  Frequency: 1,              // 每 1 個月
  ExecTimes: 999,            // 最多 999 次
  PeriodReturnURL: 'https://your-domain.com/ecpay/period/callback',
  
  // 自訂欄位 (存 userId)
  CustomField1: 'user-uuid-here'
};
```

### ⚠️ 重要注意事項

1. **不可與分期付款、紅利折抵一起使用**
2. **第一次授權失敗，訂單不會進入排程**
3. **連續 6 次扣款失敗，自動取消後續扣款**
4. **銀聯卡不支援定期定額**
5. **必須使用 HTTPS**

---

## 4. CheckMacValue 檢查碼機制

> **來源：** https://developers.ecpay.com.tw/?p=2902

### 計算步驟

```
1. 將所有參數依照「第一個英文字母 A-Z」排序
2. 以 & 串連所有參數
3. 在最前面加上 HashKey=xxx&
4. 在最後面加上 &HashIV=xxx
5. 進行 URL Encode (RFC 1866)
6. 轉換為小寫
7. 進行 SHA256 雜湊
8. 轉換為大寫 → 得到 CheckMacValue
```

### JavaScript 實作

```javascript
const crypto = require('crypto');

function generateCheckMacValue(params, hashKey, hashIV) {
  // 1. 依字母排序
  const sortedKeys = Object.keys(params).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  
  // 2. 串連參數
  let paramStr = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  
  // 3. 加上 HashKey 和 HashIV
  paramStr = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIV}`;
  
  // 4. URL Encode
  paramStr = encodeURIComponent(paramStr);
  
  // 5. ECPay 特殊字元轉換
  paramStr = paramStr
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
  
  // 6. 轉小寫
  paramStr = paramStr.toLowerCase();
  
  // 7. SHA256 雜湊
  const hash = crypto.createHash('sha256').update(paramStr).digest('hex');
  
  // 8. 轉大寫
  return hash.toUpperCase();
}
```

### URL Encode 轉換表 (ECPay 特規)

| 字元 | 標準編碼 | ECPay 編碼 |
|------|----------|------------|
| 空格 | `%20` | `+` |
| `-` | `%2d` | `-` |
| `_` | `%5f` | `_` |
| `.` | `%2e` | `.` |
| `!` | `%21` | `!` |
| `*` | `%2a` | `*` |
| `(` | `%28` | `(` |
| `)` | `%29` | `)` |

### 驗證回傳的 CheckMacValue

```javascript
function verifyCheckMacValue(receivedParams, hashKey, hashIV) {
  const receivedCheckMac = receivedParams.CheckMacValue;
  delete receivedParams.CheckMacValue;
  
  const calculatedCheckMac = generateCheckMacValue(receivedParams, hashKey, hashIV);
  
  return receivedCheckMac === calculatedCheckMac;
}
```

---

## 5. PeriodReturnURL 定期扣款通知

> **來源：** https://developers.ecpay.com.tw/?p=49193

### 應用場景

- **第一期付款** → 通知到 `ReturnURL`
- **第二期之後** → 通知到 `PeriodReturnURL` ⚠️

### 傳輸協定

```
Accept: text/html
Content-Type: application/json
HTTP Method: POST
```

### Request 格式 (ECPay → 特店)

```json
{
  "MerchantID": "3002607",
  "RqHeader": {
    "Timestamp": 1234567890
  },
  "Data": "加密後的 JSON 字串"
}
```

### Data 解密後內容

| 欄位 | 型別 | 說明 |
|------|------|------|
| `RtnCode` | Int | 1=成功, 其他=失敗 |
| `RtnMsg` | String | 回應訊息 |
| `MerchantID` | String | 特店編號 |
| `OrderInfo` | Object | 訂單資訊 |
| `CardInfo` | Object | 信用卡資訊 |

### OrderInfo 物件

| 欄位 | 型別 | 說明 |
|------|------|------|
| `MerchantTradeNo` | String | 特店訂單編號 |
| `TradeNo` | String | 綠界交易編號 |
| `TradeAmt` | Int | 交易金額 |
| `TradeDate` | String | 訂單建立時間 |
| `PaymentType` | String | 付款方式 |
| `PaymentDate` | String | 付款時間 |
| `ChargeFee` | Number | 手續費 |
| `TradeStatus` | String | 交易狀態 |

### CardInfo 物件

| 欄位 | 型別 | 說明 |
|------|------|------|
| `AuthCode` | String(6) | 授權碼 |
| `Gwsr` | Int | 授權單號 |
| `ProcessDate` | String | 處理時間 |
| `Amount` | Int | 授權金額 |
| `Eci` | Int | 3D 驗證結果 (5,6,2,1 = 有過 3D) |
| `Card6No` | String | 卡號前 6 碼 |
| `Card4No` | String | 卡號後 4 碼 |
| `PeriodType` | String | 週期類型 |
| `Frequency` | Int | 執行頻率 |
| `ExecTimes` | Int | 執行次數 |
| `PeriodAmount` | Int | 每期金額 |
| `TotalSuccessTimes` | Int | 累計成功次數 |
| `TotalSuccessAmount` | Int | 累計成功金額 |
| `IssuingBank` | String | 發卡銀行 |
| `IssuingBankCode` | String | 發卡銀行代碼 |

### Data 範例 (解密後)

```json
{
  "RtnCode": 1,
  "RtnMsg": "Success",
  "MerchantID": "3002607",
  "OrderInfo": {
    "MerchantTradeNo": "20180914001",
    "TradeNo": "1809261503338172",
    "TradeDate": "2018/09/26 14:59:54"
  },
  "CardInfo": {
    "Gwsr": 10735183,
    "ProcessDate": "2018/09/26 14:59:54",
    "AuthCode": "777777",
    "Amount": 100,
    "Eci": 2,
    "Card4No": "2222",
    "Card6No": "491122",
    "Frequency": 5,
    "ExecTimes": 5,
    "PeriodAmount": 500,
    "TotalSuccessTimes": 2,
    "TotalSuccessAmount": 1000,
    "IssuingBank": "ESUN",
    "IssuingBankCode": "808"
  }
}
```

### ⚠️ 必須回應格式

```
1|OK
```

**回應必須是純文字 `1|OK`，否則 ECPay 會重試通知！**

### Node.js 處理範例

```javascript
app.post('/ecpay/period/callback', async (req, res) => {
  try {
    const { MerchantID, RqHeader, Data } = req.body;
    
    // 1. 解密 Data
    const decryptedData = decryptECPayData(Data, HASH_KEY, HASH_IV);
    const payload = JSON.parse(decryptedData);
    
    // 2. 檢查 RtnCode
    if (payload.RtnCode === 1) {
      // 成功 - 更新訂閱狀態
      await updateSubscriptionPayment(payload);
    } else {
      // 失敗 - 記錄失敗並設定 grace period
      await handleFailedPayment(payload);
    }
    
    // 3. 必須回應 1|OK
    res.type('text/html').send('1|OK');
    
  } catch (error) {
    console.error('PeriodReturnURL Error:', error);
    // 即使出錯也要回應，避免 ECPay 重試
    res.type('text/html').send('1|OK');
  }
});
```

---

## 6. 定期定額查詢 API

> **來源：** https://developers.ecpay.com.tw/?p=9093

### API 網址

| 環境 | URL |
|------|-----|
| 測試 | `https://ecpayment-stage.ecpay.com.tw/1.0.0/Cashier/QueryTrade` |
| 正式 | `https://ecpayment.ecpay.com.tw/1.0.0/Cashier/QueryTrade` |

### Request 格式

```json
{
  "MerchantID": "3002607",
  "RqHeader": {
    "Timestamp": 1234567890
  },
  "Data": "加密後的查詢參數"
}
```

### Data 參數 (加密前)

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `MerchantID` | String(10) | ✅ | 特店編號 |
| `MerchantTradeNo` | String(20) | ✅ | 特店訂單編號 |
| `PlatformID` | String(10) | | 平台商代號 (一般留空) |

### Response 格式

```json
{
  "MerchantID": "3002607",
  "RpHeader": {
    "Timestamp": 1234564848
  },
  "TransCode": 1,
  "TransMsg": "Success",
  "Data": "加密後的回應資料"
}
```

---

## 7. 介接注意事項

> **來源：** https://developers.ecpay.com.tw/?p=8987

### 呼叫 API 注意事項

1. **使用 HTTP POST** 方式傳送
2. **禁止使用 HTML Tag** (如 `<br/>`, `<B>`, `<h1>`)
3. **不可將 HashKey/HashIV 放在前端代碼**
4. **主機需進行時間校正** (避免時差問題)
5. **僅支援 TLS 1.2**
6. **API 呼叫過快會收到 403** (需等 30 分鐘)

### 防火牆設定

#### 連出到綠界

| 環境 | Domain | Port |
|------|--------|------|
| 正式 | `ecpayment.ecpay.com.tw` | 443 |
| 測試 | `ecpayment-stage.ecpay.com.tw` | 443 |

#### 允許綠界連入

| 環境 | Domain | Port |
|------|--------|------|
| 正式 | `postgate.ecpay.com.tw` | 443 |
| 測試 | `postgate-stage.ecpay.com.tw` | 443 |

### ReturnURL 注意事項

1. **必須是 Server 端 URL** (不是前端)
2. **僅支援 HTTP/HTTPS (Port 80/443)**
3. **不支援中文網址** (需用 punycode)
4. **不可與 CDN 網址相同**
5. **收到通知後需回應 `1|OK`**

---

## 8. 錯誤代碼

### 常見 RtnCode

| 代碼 | 說明 |
|------|------|
| `1` | 成功 |
| `10100001` | 商店代號錯誤 |
| `10100050` | 未開啟付款方式 |
| `10100058` | 訂單編號重複 |
| `10100089` | 金額不符 |
| `10200047` | CheckMacValue 錯誤 |
| `10200095` | 時間戳過期 |

---

## 📎 官方資源連結

| 資源 | URL |
|------|-----|
| ECPay Developers 首頁 | https://developers.ecpay.com.tw/ |
| 信用卡定期定額 | https://developers.ecpay.com.tw/?p=2868 |
| PeriodReturnURL | https://developers.ecpay.com.tw/?p=49193 |
| CheckMacValue 機制 | https://developers.ecpay.com.tw/?p=2902 |
| 測試介接資訊 | https://developers.ecpay.com.tw/?p=7398 |
| 定期定額查詢 | https://developers.ecpay.com.tw/?p=9093 |
| 介接注意事項 | https://developers.ecpay.com.tw/?p=8987 |
| 官方 GitHub SDK | https://github.com/ecpay |
| 電子發票文件 | https://www.ecpay.com.tw/Business/invoice_Document |
| B2C 發票 API | https://developers.ecpay.com.tw/?p=7809 |
| 商家後台 | https://vendor.ecpay.com.tw/ |

---

*此文件根據 ECPay 官方技術文件整理，供開發參考使用。*
