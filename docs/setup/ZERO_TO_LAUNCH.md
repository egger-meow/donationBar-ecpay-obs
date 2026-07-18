# 從零到上線 —— 單一線性步驟總覽

`docs/setup/` 底下其他文件（[COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md)、
[GO_LIVE_FREE_CHECKLIST.md](GO_LIVE_FREE_CHECKLIST.md)、[DEPLOYMENT.md](DEPLOYMENT.md)、
[GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)）各自涵蓋一個主題的完整細節，但沒有
一份文件是「照順序做完就等於上線」的單一路徑。這份文件就是那個路徑：把所有步驟串成
一條線，每一步只留下要做的事與該去哪份文件查細節，細節本身不重複寫在這裡。

每個步驟標示由誰執行：
- 👤 **需要你本人** —— 註冊帳號、審核、簽約、法務決策，我無法代勞。
- 🤝 **我可以協助** —— 寫設定、跑指令、驗證結果；你提供帳號密鑰即可。

目前程式碼與測試的完成狀態，見 [ROADMAP.md](../../ROADMAP.md) 第 1 節與
[PROGRESS.md](../PROGRESS.md)。這份文件描述的是「你接下來要做什麼」，不是「已經做了
什麼」。

---

## 第 0 步：本機沙盒 —— 確認專案能跑起來 🤝

不需要任何帳號，全部對著本機 `db.json`：

```bash
cp .env.example .env    # 保持 ENVIRONMENT=sandbox
npm install
npm run dev              # http://localhost:3000
```

先看不需金流設定的示範疊加層：`http://localhost:3000/overlay?test=1`。

要走完整的登入流程（本機也需要一組 Google OAuth 用戶端），照
[COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md) 的「路徑 A」逐步做，包含
`npm run migrate` 建立初始工作區，以及登入後在 `/admin/ecpay` 設定 ECPay 測試金鑰。

✅ 完成判準：本機能登入、能看到 admin 後台、`?test=1` 疊加層正常顯示。

---

## 第 1 步：註冊帳號（全部免費）👤

依 [GO_LIVE_FREE_CHECKLIST.md](GO_LIVE_FREE_CHECKLIST.md) 第「階段 1」的表格逐一註冊：

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) —— OAuth 用戶端
2. [Neon](https://neon.tech) —— PostgreSQL（選 Singapore 區域）
3. [Render](https://render.com) —— 網頁服務代管
4. [UptimeRobot](https://uptimerobot.com) —— 監控與保持喚醒
5. ECPay 測試環境不需申請，直接用官方公開的測試特店金鑰即可（見下方第 4 步）

Google OAuth 用戶端的詳細建立步驟見 [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)。

✅ 完成判準：手上有 Google OAuth 的 Client ID/Secret、Neon 的資料庫連線字串、Render
帳號、UptimeRobot 帳號。

---

## 第 2 步：產生正式環境金鑰 🤝

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # CREDENTIAL_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # BACKUP_ENCRYPTION_KEY
```

把這三組值、Neon 的 `DATABASE_URL`、Google OAuth 憑證，依
[GO_LIVE_FREE_CHECKLIST.md](GO_LIVE_FREE_CHECKLIST.md) 第「階段 2」的完整表格，貼進
Render 的 Environment 分頁。此階段 `ECPAY_ENVIRONMENT` 設為 `stage`，
`BILLING_ECPAY_*` 先填 ECPay 官方測試特店金鑰即可，還不需要真實特店。

✅ 完成判準：Render 專案的 Environment 分頁已填好所有必要變數。

---

## 第 3 步：部署到 Render，跑一次完整的測試金流 🤝

Render 部署流程：build `npm ci` → pre-deploy `npm run migrate` → start `npm start`。
細節見 [DEPLOYMENT.md](DEPLOYMENT.md)「建置與發版」與「金流服務商設定」兩節（記得把
`https://<app>.onrender.com/ecpay/return` 與 `.../ecpay/period/callback` 這類回呼網址
概念對應到你的 Render 網域）。

部署完成後：

```bash
npm run preflight:staging -- --base-url https://<app>.onrender.com
```

這只驗證環境「連得到」（見 [STAGING_PREFLIGHT.md](../operations/STAGING_PREFLIGHT.md)），
接著要照 [DEPLOYMENT.md](DEPLOYMENT.md)「上線前驗證」清單，實際跑一次登入 → 建立
工作區 → 設定測試金鑰 → 完成一筆 ECPay 測試付款 → 在 OBS 疊加層看到即時更新。

✅ 完成判準：`preflight:staging` 通過，且在部署好的網址上完成過一次完整的
「登入 → 付款（測試金流）→ OBS 顯示」流程。

---

## 第 4 步：監控告警與備份還原演練 🤝

- 設定 `ALERT_WEBHOOK_URL`，依
  [MONITORING_AND_INCIDENT_RESPONSE.md](../operations/MONITORING_AND_INCIDENT_RESPONSE.md)
  接上告警管道，再依
  [ALERT_EXERCISE_TEMPLATE.md](../operations/ALERT_EXERCISE_TEMPLATE.md) 實際跑一次
  演練並填表存證（例如刻意讓 readiness 失敗，確認告警真的送達）。
- 依 [DEPLOYMENT.md](DEPLOYMENT.md)「加密備份與還原」，在 Neon 的預備資料庫上完整跑
  一次 `npm run backup` → `npm run restore`，並驗證還原後的資料正確。

✅ 完成判準：至少一次告警演練有記錄、至少一次備份還原演練有記錄且資料正確。

---

## 第 5 步：申請真正的 ECPay 特店（與上面幾步並行進行）👤

這是唯一需要外部審核時間的步驟，**建議一開始就送出申請**，同時進行第 1–4 步。

- 官網：[ECPay 綠界](https://www.ecpay.com.tw)。需要台灣身分證／公司登記與銀行帳戶。
- 平台自己收訂閱費用的特店，審核通過後的設定步驟見
  [ECPAY_SETUP_CHECKLIST.md](../subscription/ECPAY_SETUP_CHECKLIST.md)（填入
  `BILLING_ECPAY_*`、在 ECPay 後台設定 ReturnURL／PeriodReturnURL、切換
  `ECPAY_ENVIRONMENT=production`）。
- 個別實況主自己收捐款用的特店是他們自己申請、自己在 admin 後台輸入，跟平台的特店
  是兩回事（見 [COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md) 路徑 A 步驟 7）。

✅ 完成判準：平台帳務用的特店審核通過，取得
`BILLING_ECPAY_MERCHANT_ID`／`_HASH_KEY`／`_HASH_IV`。

---

## 第 6 步：法務／會計審查 👤

服務條款、隱私政策、資料保存規範、稅務／電子發票，依你所在法域找合適的顧問審查。
本程式碼庫沒有對應文件，因為這不是程式碼能解決的事，但這是
[ROADMAP.md](../../ROADMAP.md) 明確列出、擋在「開始收真錢」之前的關卡（第 9、17 節）。

✅ 完成判準：條款／政策已由專業人士審過並定案。

---

## 第 7 步：切換正式金流，完成一筆真實付款 🤝👤

第 5、6 步都完成後：

1. 依 [ECPAY_SETUP_CHECKLIST.md](../subscription/ECPAY_SETUP_CHECKLIST.md) 把 Render
   環境變數換成真實的 `BILLING_ECPAY_*`，`ECPAY_ENVIRONMENT` 改成 `production`。
2. 完成至少一筆真實新台幣付款作為啟用證據（可以先用很小的金額測試）。
3. 確認 callback 正常入帳、金額正確、無重複扣款。

✅ 完成判準：一筆真實付款成功入帳，作為 [ROADMAP.md](../../ROADMAP.md) 正式環境驗證
關卡的證據。

---

## 第 8 步：招募第一位外部實況主 👤

依 [ROADMAP.md](../../ROADMAP.md) 第 10–11、13 節：找**一位**原本不熟悉這個產品、
且已經有實際觀眾捐款量的實況主，讓他在完全沒有你介入資料庫或遠端操作的情況下，
自行完成：連結自己的 ECPay 帳號 → 加入 OBS Browser Source → 收到測試提示（目標：
15 分鐘內）→ 完成一筆真實付款 → 在 OBS 看到真實提示。

這一步是整個 roadmap 目前定義的「證明產品能賣」的里程碑，不是「做更多功能」。

✅ 完成判準：一位外部實況主獨立完成整個流程，且時間、卡點都有記錄下來。

---

## 第 9 步：Founder 定價測試 👤

依 [ROADMAP.md](../../ROADMAP.md) 第 12 節：向該實況主展示 Founder 方案報價
（NT$199／299／399 三個測試價位），記錄他願意付費或拒絕的理由，並明確說明「固定月費
何時比 Nekolive 的抽成便宜」（月捐款淨額約 NT$6,600–13,300 以上才划算）。

✅ 完成判準：至少一位實況主開始付費或明確承諾要付費，理由有記錄下來。

---

## 之後：擴大到 5 位、再到 10–20 位 👤

只有在第 8、9 步都通過後，才依 [ROADMAP.md](../../ROADMAP.md) 第 13 節擴大測試名單，
並開始進行第 13 節的市場驗證訪談（現有／前 Nekolive 使用者、申請被拒者、直接用 ECPay
的創作者、用其他平台的創作者），確認真正的差異化優勢，而不是憑感覺猜測。

---

## 一眼看懂：誰卡在哪一步

| 步驟 | 誰執行 | 外部等待時間 |
|---|---|---|
| 0 本機沙盒 | 我 | 無 |
| 1 註冊免費帳號 | 你 | 幾分鐘內完成 |
| 2 產生金鑰、填環境變數 | 我 + 你（提供帳密） | 無 |
| 3 部署 + 測試金流驗證 | 我 + 你 | 無 |
| 4 告警與備份演練 | 我 + 你 | 無 |
| 5 申請真實 ECPay 特店 | 你 | **審核天數，最早開始** |
| 6 法務／會計審查 | 你 | 依顧問排程 |
| 7 切換正式金流、真實付款 | 我 + 你 | 依 5、6 完成時間 |
| 8 招募第一位實況主 | 你 | 依你的人脈與 outreach |
| 9 Founder 定價測試 | 你 | 依實況主回應 |

第 5 步（ECPay 特店審核）通常是耗時最長的外部流程，建議現在就開始申請，跟第 1–4 步
同時進行。
