從零串接 ECPay（綠界）做「訂閱／定期定額」你要準備的東西、該做的步驟與檢查點如下：

# 0) 事前準備（商務／法規）

* 公司或個人商家資料（統編、聯絡人、銀行帳號、收款合約等）。
* 網域與 **HTTPS 憑證**（所有回呼都需 HTTPS）。([Developers｜綠界科技ECPay：API技術文件][1])
* 別自行處理卡號：採用綠界跳轉頁（或綠界收單）即可，避免碰到 PCI 責任。

# 1) 申請與開通

* 申請 **綠界特店（MerchantID）**，開通信用卡收款與「信用卡定期定額」功能。開通後會拿到 **HashKey / HashIV**。([Developers｜綠界科技ECPay：API技術文件][2])
* 先用官方 **測試環境** 做串接：
  `MerchantID=2000132`、`HashKey=5294y06JbISpM5x9`、`HashIV=v77hoKGq4kWxNNIS`（僅限測試）。([Developers｜綠界科技ECPay：API技術文件][3])

# 2) 技術與架構決策

* 後端語言/框架（Node/TS、Python、Go、.NET、PHP…），選用官方或社群 SDK：
  官方 GitHub：PHP / .NET / Python AIO；亦有發票 SDK 與社群套件可用。([GitHub][4])
* 資料庫／任務排程（重試、對帳、續扣排程事件處理）。
* 事件紀錄與告警（Webhook 失敗、續扣失敗、退款/取消等）。

# 3) 必備 API 與參數（一次性付款 + 訂閱）

* **檢查碼（CheckMacValue）**：用 HashKey/HashIV + 參數串接、URL 編碼、小寫化、**SHA256** 計算雜湊。這是每支 API 安全必備。([Developers｜綠界科技ECPay：API技術文件][5])
* **ReturnURL**（伺服器端）：綠界付款結果的後端通知（你要能對外開放）。([Developers｜綠界科技ECPay：API技術文件][1])
* **OrderResultURL / ClientBackURL**（前端導回）：付款完成後帶使用者回你的站（可選）。([Developers｜綠界科技ECPay：API技術文件][1])
* **定期定額核心參數**（建立授權時）：`PeriodType(日/月/年)`、`Frequency`、`ExecTimes`、`PeriodAmount`、以及 **PeriodReturnURL**（每期扣款通知 URL）。([Developers｜綠界科技ECPay：API技術文件][6])
* **PeriodReturnURL 行為**：從**第二期**起，每次自動續扣成功就會 POST 通知到你的 **PeriodReturnURL**，你的伺服器需回 **`1|OK`**。([Developers｜綠界科技ECPay：API技術文件][7])
* **查詢 API**：用「定期定額查詢」對賬與顯示訂閱狀態。([Developers｜綠界科技ECPay：API技術文件][8])

# 4) 你要先做好的三個 Endpoint

1. `POST /ecpay/return`（**ReturnURL**）：接一次性或授權結果（後端）。([Developers｜綠界科技ECPay：API技術文件][1])
2. `POST /ecpay/period/callback`（**PeriodReturnURL**）：接每期續扣結果（回 `1|OK`）。([Developers｜綠界科技ECPay：API技術文件][7])
3. `GET /billing/result`（**OrderResultURL** 可選）：使用者付款後前端導回顯示成功頁。([Developers｜綠界科技ECPay：API技術文件][1])

# 5) 使用者自助介面（超重要）

* 「我的訂閱」頁：顯示方案、下一次扣款日、發票連結、付款歷史、狀態（Active/Paused/Cancelled）。
* **取消／升降級** 流程：更新你方資料庫並（必要時）呼叫綠界對應 API 或變更訂閱參數；同步提示使用者下一期是否仍會扣款。
* **失敗扣款（dunning）**：收到 PeriodReturnURL 失敗或查詢狀態為失敗時，寄通知、提供換卡／重試機制，並排程重試。

# 6) 電子發票（可選但建議）

* 若要自動開立雲端發票，需另外串 **綠界電子發票 API/SDK**，支援 B2C（也可輸入買方統編）。([ecpay.com.tw][9])
* 常見情境：付款成功即開立、退款作廢／折讓 API。([Developers｜綠界科技ECPay：API技術文件][10])

# 7) 測試清單（Sandbox）

* 用測試 `MerchantID/HashKey/HashIV` 跑一次性付款、定期定額授權與第 2 期之後的 **PeriodReturnURL** 通知模擬。([Developers｜綠界科技ECPay：API技術文件][3])
* 驗證 **CheckMacValue** 計算正確（參數順序、URL encode 規則、大小寫、SHA256）。([Developers｜綠界科技ECPay：API技術文件][5])
* 驗證通知端點可對外、回應格式正確（`1|OK`）。([Developers｜綠界科技ECPay：API技術文件][7])
* 關鍵異常流程：付款失敗、退款、取消訂閱、信用卡過期／變更卡號。

# 8) 上線切換（Prod）

* 把測試的 `MerchantID/HashKey/HashIV` 換成正式環境值，並在後台設定正式的 ReturnURL / PeriodReturnURL。([Developers｜綠界科技ECPay：API技術文件][3])
* 啟用正式金流通道、確認稅務／電子發票與公司資訊。
* 監控：對帳排程、Webhook 重試、失敗告警。

# 9) 你可以直接用的資源

* **ECPay Developers（總覽與文件）**：流程、名詞、各 API 規格。([Developers｜綠界科技ECPay：API技術文件][2])
* **信用卡定期定額 API 文件**：參數與範例。([Developers｜綠界科技ECPay：API技術文件][6])
* **PeriodReturnURL 說明**：每期續扣通知、回應 `1|OK`。([Developers｜綠界科技ECPay：API技術文件][7])
* **測試介接資訊**（測試 MerchantID / HashKey / HashIV）。([Developers｜綠界科技ECPay：API技術文件][3])
* **檢查碼（CheckMacValue）機制**。([Developers｜綠界科技ECPay：API技術文件][5])
* **官方 GitHub SDK**（Python / .NET / PHP 等）。([GitHub][4])
* **電子發票 API / 文件**。([ecpay.com.tw][9])



[1]: https://developers.ecpay.com.tw/?p=8987&utm_source=chatgpt.com "介接注意事項- ECPay Developers"
[2]: https://developers.ecpay.com.tw/?utm_source=chatgpt.com "ECPay Developers｜綠界科技：API技術文件"
[3]: https://developers.ecpay.com.tw/?p=7398&utm_source=chatgpt.com "準備事項/ 測試介接資訊"
[4]: https://github.com/ecpay?utm_source=chatgpt.com "綠界ECPay"
[5]: https://developers.ecpay.com.tw/?p=2902&utm_source=chatgpt.com "檢查碼機制說明- ECPay Developers"
[6]: https://developers.ecpay.com.tw/?p=2868&utm_source=chatgpt.com "信用卡定期定額- ECPay Developers"
[7]: https://developers.ecpay.com.tw/?p=49193&utm_source=chatgpt.com "PeriodReturnURL"
[8]: https://developers.ecpay.com.tw/?p=9093&utm_source=chatgpt.com "定期定額查詢- ECPay Developers"
[9]: https://www.ecpay.com.tw/Business/invoice_Document?utm_source=chatgpt.com "電子發票串接文件說明"
[10]: https://developers.ecpay.com.tw/?p=7809&utm_source=chatgpt.com "首頁- B2C電子發票API技術文件"
