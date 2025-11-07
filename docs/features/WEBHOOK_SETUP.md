# ECPay Webhook 設定指南

## 概述

系統現在支援兩種接受捐款的方式：

### 方法一：捐款頁面（原有功能）
- URL: `http://your-domain.com/donate`
- 觀眾直接在頁面上輸入金額和留言
- 自動導向 ECPay 付款頁面
- 付款完成後自動更新進度條

### 方法二：ECPay Webhook（新功能）✨
- URL: `http://your-domain.com/webhook/ecpay`
- 適合已經有自己商店或捐款系統的使用者
- ECPay 自動發送付款通知到此端點
- 自動更新進度條和 Overlay

---

## Webhook 設定步驟

### 1. 在 Admin 面板設定 ECPay 金流資訊
確保已填寫：
- MerchantID（商店代號）
- HashKey
- HashIV

### 2. 在 ECPay 商店後台設定

1. 登入 [ECPay 商店後台](https://vendor.ecpay.com.tw/)
2. 進入「系統設定」→「系統介接設定」
3. 找到「付款完成通知回傳網址」(ReturnURL)
4. 填入 Webhook URL:
   ```
   https://your-domain.com/webhook/ecpay
   ```
5. 確保使用 **POST** 方法
6. 儲存設定

### 3. 測試 Webhook

在 ECPay 後台建立測試訂單，付款完成後：
- 檢查伺服器 console log 是否收到 `📨 ECPay webhook received`
- 確認捐款是否出現在進度條中
- 檢查 Overlay 是否即時更新

---

## 技術細節

### Webhook 接收的資料格式

ECPay 會以 POST 方式傳送以下資料（參考：https://developers.ecpay.com.tw/?p=41030）：

```
MerchantID=XXXXX
MerchantTradeNo=DONATE1234567890
RtnCode=1
TradeAmt=100
CustomField1=捐款人名稱
CustomField2=留言內容
CheckMacValue=XXXXXXXXXXXXX
...（其他欄位）
```

### 安全驗證

Webhook 端點會執行以下驗證：
1. ✅ 檢查 CheckMacValue 簽章是否正確
2. ✅ 驗證 MerchantID 是否符合
3. ✅ 確認 RtnCode=1（付款成功）
4. ✅ 防止重複的捐款記錄（透過 TradeNo）

### 自訂捐款人資訊

如果您想在 Webhook 中包含捐款人名稱和留言，請在建立 ECPay 訂單時設定：
- `CustomField1`: 捐款人名稱（不填則顯示 "Anonymous"）
- `CustomField2`: 留言內容

---

## 常見問題

### Q: 兩種方式可以同時使用嗎？
**A:** 可以！系統會自動去除重複的捐款記錄（透過 TradeNo）。

### Q: Webhook 收不到通知怎麼辦？
**A:** 檢查以下項目：
1. 確認伺服器可以從外部訪問（不能是 localhost）
2. 檢查 ECPay 後台的 Webhook URL 是否正確
3. 確認防火牆沒有阻擋 ECPay 的 IP
4. 查看伺服器 console log 是否有錯誤訊息

### Q: 如何測試 Webhook？
**A:** 
1. 使用 ECPay 的測試環境建立訂單
2. 或使用工具（如 Postman）模擬 ECPay 的 POST 請求
3. 記得要包含正確的 CheckMacValue 簽章

### Q: Webhook 支援沙盒模式嗎？
**A:** Webhook 在沙盒模式和正式環境都可使用，只要設定正確的 ECPay 金流資訊即可。

---

## 監控與除錯

### Console Log 訊息

成功處理：
```
📨 ECPay webhook received: {...}
✅ Webhook: Donation processed successfully - 捐款人名稱 donated NT$100
```

重複捐款：
```
📨 ECPay webhook received: {...}
ℹ️ Webhook: Duplicate donation detected - DONATE1234567890
```

驗證失敗：
```
📨 ECPay webhook received: {...}
❌ Webhook: Invalid CheckMacValue
```

---

## 端點資訊

| 端點 | 方法 | 用途 |
|------|------|------|
| `/donate` | GET | 捐款頁面 |
| `/create-order` | POST | 建立 ECPay 訂單（捐款頁面使用） |
| `/ecpay/return` | POST | ECPay 回傳端點（捐款頁面使用） |
| `/webhook/ecpay` | POST | ECPay Webhook 端點（新功能） |

---

## 支援

如有問題，請檢查：
1. 伺服器 console log
2. ECPay 後台的交易記錄
3. Admin 面板的當前進度是否更新

祝您使用順利！🎉
