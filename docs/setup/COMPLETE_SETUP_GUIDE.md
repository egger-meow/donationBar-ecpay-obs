# 完整設定指南

本指南涵蓋兩條獨立路徑：

- **本機沙盒（Local sandbox）** — 在自己的電腦上、對著本機 JSON 檔執行，用於開發與測試。
- **正式環境／預備環境（Production / staging）** — 在真實網域上對著 PostgreSQL 執行，供真實實況主實際使用。

不要混用這兩種模式：沙盒設定（`ENVIRONMENT=sandbox`、未設定 `DATABASE_URL`）絕不適合用於真實捐款或真實觀眾資料。

本程式碼庫的登入方式**僅有 Google OAuth**。沒有本機帳號密碼註冊、登入或重設密碼流程 —— 這些頁面在 [public/](../../public/) 中並不存在。即使在沙盒模式下也是如此：`ENVIRONMENT=sandbox` 只改變儲存後端（JSON 檔 vs. PostgreSQL），不會改變登入方式。就算只是本機開發，你也需要一組能運作的 Google OAuth 用戶端。

## 先決條件

- Node.js 18 以上版本（CI 使用 Node 20）。
- 一個具備 OAuth 2.0 用戶端的 Google Cloud 專案 —— 參見 [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)。**這是你必須自行在 Google Cloud Console 完成的外部前置作業；本程式碼庫無法代為建立。**
- 若只是沙盒／本機開發：不需要其他東西。一旦建立工作區，就能對 ECPay 的測試環境（stage）執行捐款流程。
- 若是正式環境／預備環境：需要託管的 PostgreSQL 資料庫、HTTPS 網域，以及 ECPay 特店金鑰（包含工作區層級的收款帳號，若你打算對 DonationBar 本身收費，還需要另外一組獨立的帳務用特店帳號）。**ECPay 特店審核是與 ECPay 之間的外部流程，本程式碼庫無法驗證或保證其結果 —— 在你自行向 ECPay 確認之前，請將任何特店編號視為尚未驗證。**

## 路徑 A：本機沙盒設定

1. Clone 本專案並安裝相依套件：

   ```bash
   npm install
   ```

2. 複製環境變數範本並填入本機使用的值：

   ```bash
   cp .env.example .env
   ```

3. 沙盒模式至少需在 `.env` 設定以下項目：

   | 變數 | 用途 |
   |---|---|
   | `ENVIRONMENT=sandbox` | 使用本機 `db.json` 而非 PostgreSQL。`DATABASE_URL` 留空。 |
   | `ECPAY_ENVIRONMENT=stage` | 連到 ECPay 的測試環境端點，而非正式收款金流。 |
   | `SESSION_SECRET` | 沙盒環境用任意隨機字串即可，不需符合正式環境的強度檢查。 |
   | `CREDENTIAL_ENCRYPTION_KEY` | 即使沙盒模式也必須設定 —— 工作區的 ECPay 金鑰會加密儲存。以 `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` 產生。 |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | 來自你的 Google OAuth 用戶端。本機開發的 Callback URL 應為 `http://localhost:3000/api/auth/google/callback`。 |
   | `ADMIN_EMAIL` | **設為你自己真實的 Google 帳號 email**，而非佔位字串。詳見步驟 5。 |

4. 執行內建的 migration，建立資料庫結構並依 `ADMIN_*` 變數建立初始工作區與管理員帳號：

   ```bash
   npm run migrate
   ```

5. 啟動伺服器，並使用**與 `ADMIN_EMAIL` 相同的 Google 帳號 email** 登入。沒有另外的密碼：初始管理員帳號是在 OAuth 登入時依 email 比對，而不是靠你輸入的憑證。

   ```bash
   npm start
   # 或者，檔案變更時自動重啟：
   npm run dev
   ```

   造訪 `http://localhost:3000/login`，並依畫面上的按鈕（例如「使用 Google 帳號登入」）繼續進行 Google 登入。

6. 確認伺服器狀態正常：

   ```bash
   curl http://localhost:3000/health/live
   curl http://localhost:3000/health/ready
   ```

7. 在管理後台中，於 `/admin/ecpay`（或應用內對應的設定畫面）設定工作區層級的 ECPay 測試金鑰。這些是逐工作區輸入的 `MERCHANT_ID`／`HASH_KEY`／`HASH_IV`，透過畫面輸入並以 `CREDENTIAL_ENCRYPTION_KEY` 加密儲存 —— 與你在 `.env` 中設定的 `MERCHANT_ID`／`HASH_KEY`／`HASH_IV`（僅作為舊版備援使用）是分開的，也與下方的 `BILLING_ECPAY_*` 分開。

8. 將你工作區的 OBS 疊加頁面（`/overlay/<slug>`）加入 OBS 作為 Browser Source，確認即時更新是否正常；或加上 `?test=1` 進入示範模式，不需真實捐款即可測試。

## 路徑 B：正式環境／預備環境設定

正式環境／預備環境的完整設定 —— 建置 PostgreSQL、HTTPS 網域、金鑰、加密備份、migration 演練、以及完整上線檢查清單 —— 詳細記載於 [DEPLOYMENT.md](DEPLOYMENT.md)。請直接依該文件操作，不在此重複，包含其中的備份／還原演練與 rollback 指引。

在依賴任何已部署環境之前，先執行 [STAGING_PREFLIGHT.md](../operations/STAGING_PREFLIGHT.md) 所描述的唯讀檢查（`npm run preflight:staging`）。它會確認 `/health/live`、`/health/ready`、`/api/pricing`、request ID 與 CSP（並可選擇性檢查你的 alert webhook）—— 但它**不能取代** DEPLOYMENT.md 中的付款與 callback 演練。

環境上線後，請依 [MONITORING_AND_INCIDENT_RESPONSE.md](../operations/MONITORING_AND_INCIDENT_RESPONSE.md) 確認告警確實有接上，並依 [ALERT_EXERCISE_TEMPLATE.md](../operations/ALERT_EXERCISE_TEMPLATE.md) 做一次真實的告警演練。

**正式環境的外部／法務前置作業**（本程式碼庫無法驗證 —— 在你自行確認前請視為未完成事項）：
- ECPay 特店審核，包含工作區收款帳號，以及若你打算對 DonationBar 本身收費，還需另外審核的平台週期扣款帳號（`BILLING_ECPAY_*`）。
- 已授權你正式網域的正式版 Google OAuth 用戶端（參見 [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)）。
- 適用於你所在法域的服務條款、隱私政策、資料保存規範及稅務／電子發票審核。

## 環境變數對照表

本表對應 [.env.example](../../.env.example)；若兩者有出入，以該檔案為準。

| 變數 | 沙盒模式 | 正式環境 | 備註 |
|---|---|---|---|
| `ENVIRONMENT` | `sandbox` | `production` | 決定使用 JSON（`db.json`）或 PostgreSQL 儲存。 |
| `DATABASE_URL` | 留空 | 必填 | 正式環境未設定會直接導致啟動失敗，這是刻意設計。 |
| `ECPAY_ENVIRONMENT` | `stage` | `stage` 或 `production` | 與 `ENVIRONMENT`／`NODE_ENV` 彼此獨立。 |
| `BASE_URL` | `http://localhost:3000` | 你的 HTTPS 網域 | 用於組成 ECPay callback 網址。 |
| `SESSION_SECRET` | 任意字串 | 32 字元以上的強密鑰 | 正式環境啟動時，弱密鑰或佔位值會直接失敗。 |
| `CREDENTIAL_ENCRYPTION_KEY` | 必填 | 必填 | 用於加密每個工作區 ECPay 金鑰的 base64 32 位元組金鑰（[lib/credentials.js](../../lib/credentials.js)）。 |
| `BACKUP_ENCRYPTION_KEY` | 選填 | `npm run backup`／`restore` 必填 | 需與其保護的備份檔分開保管。 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | 必填 | 必填 | Google OAuth 是唯一的登入方式；參見 [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)。 |
| `MERCHANT_ID` / `HASH_KEY` / `HASH_IV` | 選填 | 選填 | 僅作為舊版備援；一般工作區的收款金鑰是在管理後台逐工作區輸入，而非設定於此。 |
| `BILLING_ECPAY_MERCHANT_ID` / `_HASH_KEY` / `_HASH_IV` | 不適用 | 若要對 DonationBar 本身收費則必填 | DonationBar 自身的訂閱扣款 —— 與任何工作區的收款金鑰是不同的特店帳號。 |
| `SUBSCRIPTION_TRIAL_DAYS` / `SUBSCRIPTION_MONTHLY_PRICE` | 選填 | 需設為正式數值 | 控制平台訂閱的試用期／付費牆規則。 |
| `PLATFORM_ADMIN_EMAILS` | 選填但建議設定 | 必填 | 逗號分隔的 email 清單，具備平台級管理權限（`requirePlatformAdmin`），與初始 `ADMIN_EMAIL` 工作區擁有者無關。 |
| `ALERT_WEBHOOK_URL` / `ALERT_WEBHOOK_TIMEOUT_MS` | 選填 | 建議設定 | Readiness／webhook／5xx 失敗的去識別化告警；參見 [MONITORING_AND_INCIDENT_RESPONSE.md](../operations/MONITORING_AND_INCIDENT_RESPONSE.md)。正式環境必須為 HTTPS。 |
| `STAGING_BASE_URL` / `STAGING_PREFLIGHT_CHECK_ALERT_WEBHOOK` / `STAGING_PREFLIGHT_TIMEOUT_MS` | 應用程式本身不使用 | 僅供 `npm run preflight:staging` 使用 | 參見 [STAGING_PREFLIGHT.md](../operations/STAGING_PREFLIGHT.md)。 |
| `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_DISPLAY_NAME` | 初始化時必填 | 初始化時必填 | 僅由 `npm run migrate` 讀取一次，用於建立初始 `'default'` slug 的工作區與其擁有者帳號，並在 OAuth 登入時依該 Google 帳號的 email 比對。`ADMIN_PASSWORD` 雖會儲存但不用於登入，因為沒有本機密碼登入路由。 |
| `SMTP_*` / `EMAIL_FROM` | 選填 | 選填 | 僅在啟用 email 通知時使用；留空即停用。 |

## 網址結構

路由皆以 `slug` 區分工作區，透過 [server.js](../../server.js) 中的 `getWorkspaceFromSlug()` 解析：

- `/overlay/:slug` —— OBS Browser Source 頁面。同時支援 `?fg=`、`?bg=`、`?bar=`、`?bar_light=` 顏色覆寫，以及 `?test=1` 示範模式。
- `/donate/:slug` —— 面向觀眾的捐款頁面。
- `/webhook/:slug` —— ECPay 非同步付款通知端點。
- 未帶 slug 的路由，會回退到 `npm run migrate` 建立的 `'default'` 工作區。

`admin.html`、`donate.html`、`overlay.html` 只能透過上述已驗證／帶 slug 的 Express 路由存取；直接以靜態檔案方式請求會依設計回傳 404。

## 疑難排解

- **無法登入**：確認 `GOOGLE_CLIENT_ID`／`GOOGLE_CLIENT_SECRET`／`GOOGLE_CALLBACK_URL` 皆已設定，且 callback URL 與 Google Cloud Console 中登記的完全一致。沒有密碼可以重設 —— 存取權完全取決於你使用哪個 Google 帳號登入。
- **初始管理員帳號無法登入**：`.env` 中的 `ADMIN_EMAIL` 必須與你登入時使用的 Google 帳號 email 完全一致；比對是在 migration 執行「之後」才生效，而非之前。
- **`/health/ready` 回傳非 `ok` 狀態**：檢查 `database.healthCheck()` —— 在沙盒模式代表 `db.json` 無法讀取或已損毀；在正式環境代表 PostgreSQL 無法連線。
- **Webhook／callback 失敗**：確認 `/admin/ecpay` 中該工作區的 ECPay `HashKey`／`HashIV` 與向 ECPay 註冊該特店時所用的一致，並確認 `BASE_URL` 與 ECPay 設定要 callback 回來的網域一致。
- **啟動時出現加密金鑰錯誤**：`CREDENTIAL_ENCRYPTION_KEY` 必須與當初加密該金鑰時所用的完全相同；金鑰換了就無法解密先前儲存的值。若是從舊版未加密狀態遷移過來，請執行 `npm run migrate` 中的 `encrypt-provider-credentials.js` 步驟。
