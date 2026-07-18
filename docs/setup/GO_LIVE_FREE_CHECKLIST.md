# 上線檢查清單 —— 免費優先、最高 CP 值

目標：讓 DonationBar 從本機沙盒走到一個可公開連線的部署環境，讓一位外部實況主能夠使用，
且在第一位付費實況主證明產品價值之前**基礎設施花費為新台幣 0 元**（依照
[ROADMAP.md](../../ROADMAP.md) 第 17 節）。以下每項服務截至 2026-07 都有可實際使用的免費方案；
唯一無可避免的成本是 ECPay 對真實付款收取的單筆交易手續費，這不屬於基礎設施成本。

## 階段 0 —— 本機沙盒（不需要任何帳號）

完全離線運作，對著 `db.json`：

```bash
cp .env.example .env    # 保持 ENVIRONMENT=sandbox
npm install
npm run dev             # http://localhost:3000
```

不需任何金流設定即可看到疊加層示範：`http://localhost:3000/overlay?test=1`。

## 階段 1 —— 需要註冊的帳號（全部免費）

| # | 服務 | 用途 | 免費方案實際狀況 |
|---|---------|----------|------------------------|
| 1 | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | OAuth 2.0 登入（唯一的登入方式） | 免費，申請 OAuth 憑證不需信用卡 |
| 2 | [Neon](https://neon.tech) | 正式環境用 PostgreSQL | 免費方案：約 3 GiB 儲存空間，永久保留（不會過期）。地區請選 **Singapore (ap-southeast-1)** —— 對台灣延遲最低 |
| 3 | [Render](https://render.com) | Node 網頁服務代管 | 免費方案：每月 750 小時，內含 HTTPS 的 `*.onrender.com` 子網域。閒置 15 分鐘會自動休眠（見下方保持喚醒說明）。替代方案：[Koyeb](https://koyeb.com)（1 個免費服務，512 MB） |
| 4 | [ECPay 綠界](https://www.ecpay.com.tw) | 金流處理 | **測試環境（stage）**：免費 —— 使用 ECPay 公開發布的測試特店金鑰即可，不需申請（`ECPAY_ENVIRONMENT=stage`）。**正式環境**：申請特店帳號本身免費；ECPay 會對真實金流收取單筆手續費（信用卡約 2–3%）。需要台灣身分證／公司登記與銀行帳戶 |
| 5 | [UptimeRobot](https://uptimerobot.com) | 監控 `/health/ready` 並讓 Render 保持喚醒 | 免費方案：50 個監控項目，5 分鐘檢查間隔 |
| 6 | （之後，選用）[Brevo](https://brevo.com) | 用於發送歡迎信的 SMTP 服務 | 免費方案：每日 300 封信。不設定 SMTP 應用程式也能正常運作 |
| 7 | （之後，選用）自訂網域 | 品牌形象 | 每年約 US$10 —— 唯一需付費的項目，且完全選用；`*.onrender.com` 的 HTTPS 本身就足以支援 OAuth 與 ECPay callback |

備註：

- **為何用 Neon 而非 Render 的免費 Postgres**：Render 的免費資料庫 90 天後會過期；
  Neon 不會。付款資料不該放在有倒數計時的資料庫上。
- **保持喚醒**：Render 免費方案閒置 15 分鐘後會休眠，喚醒需要 30–50 秒 ——
  這會在直播進行中打斷 OBS 疊加層的 SSE 連線。用 UptimeRobot 每 5 分鐘 ping 一次
  `/health/live` 即可保持喚醒（每月 750 小時大約等於一個全天候運作的服務）。
  **在有真實實況主要正式開台前，請升級到 Render Starter（約每月 US$7）**——
  這筆花費要等到 roadmap 中「第一位實況主驗證」通過後才需要投入，不需提前付費。
- **兩種 ECPay 角色**：平台自己的特店帳號用於收取 DonationBar 的*訂閱*費用
  （`BILLING_ECPAY_*`）；每位實況主則在管理後台連結**自己的** ECPay 特店，讓捐款
  直接入帳給他們。若是使用測試金鑰的封閉測試（closed beta），一組測試特店即可同時
  扮演這兩種角色。

## 階段 2 —— 正式環境的環境變數

[lib/config.js](../../lib/config.js) 中的 `validateProductionConfig()` 只要缺少或偵測到
弱值就會直接讓啟動失敗。在本機產生金鑰後，貼到 Render 的 Environment 分頁（絕不要提交到
版本控制）：

```bash
# 各執行一次即可：
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # CREDENTIAL_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # BACKUP_ENCRYPTION_KEY
```

| 變數 | 值 | 來源 |
|----------|-------|--------|
| `ENVIRONMENT` | `production` | — |
| `NODE_ENV` | `production` | — |
| `BASE_URL` | `https://<app>.onrender.com` | Render（必須為 HTTPS） |
| `DATABASE_URL` | `postgres://…` | Neon 控制台 → connection string |
| `SESSION_SECRET` | 32 字元以上隨機字串 | 上方指令產生 |
| `CREDENTIAL_ENCRYPTION_KEY` | base64 32 位元組金鑰 | 上方指令產生 |
| `BACKUP_ENCRYPTION_KEY` | base64 32 位元組金鑰 | 上方指令產生（供 `npm run backup` 使用） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth 用戶端 | Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `https://<app>.onrender.com/api/auth/google/callback` | 必須與 Google Console 中登記的 redirect URI 一致 |
| `PLATFORM_ADMIN_EMAILS` | 你的 Gmail 帳號 | 逗號分隔 |
| `ECPAY_ENVIRONMENT` | 在真實特店核准前用 `stage`，核准後改為 `production` | — |
| `BILLING_ECPAY_MERCHANT_ID` / `BILLING_ECPAY_HASH_KEY` / `BILLING_ECPAY_HASH_IV` | 先用測試金鑰，之後換成真實特店金鑰 | ECPay |
| `SUBSCRIPTION_TRIAL_DAYS` / `SUBSCRIPTION_MONTHLY_PRICE` | 選填；預設 30 / 70 | — |
| `ALERT_WEBHOOK_URL` | 選填；留空即停用 | 參見 [MONITORING_AND_INCIDENT_RESPONSE.md](../operations/MONITORING_AND_INCIDENT_RESPONSE.md) |
| `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_DISPLAY_NAME` | 僅供 `npm run migrate` 用於初始化管理員 | — |

Render 的 Pre-Deploy Command 欄位只有付費方案的 instance type 才有——免費方案的
Web Service 建立畫面根本不會出現這個欄位。免費方案請把 migration 併進 Build
Command：**Build Command** 設為 `npm ci && npm run migrate`，**Start Command** 設為
`npm start`。這樣做是安全的，因為 `npm run migrate` 的每個步驟都設計成附加式
（additive）、可以重複執行；Render 的 Environment 分頁變數（包含 `DATABASE_URL`）
在 build 階段就讀得到。健康檢查端點：`/health/live`（liveness）、`/health/ready`
（DB 連線檢查）。
部署完成後，從你自己的機器執行
`npm run preflight:staging -- --base-url https://<app>.onrender.com`
（參見 [STAGING_PREFLIGHT.md](../operations/STAGING_PREFLIGHT.md)）。

## 階段 3 —— 何時開始花錢（依 CP 值排序）

1. **每月新台幣 0 元** —— 以上全部，足以應付預備環境、訪談與 OBS 測試。
2. **約每月 US$7（Render Starter）** —— 當有真實實況主排定要正式開台時就該升級；
   移除冷啟動問題，避免疊加層 SSE 在直播中被打斷。
3. **約每年 US$10（網域）** —— 只有在品牌形象開始影響轉換率時才需要。
4. 其餘項目（Neon 付費方案、email 量、監控服務）在第一批付費使用者出現之前，
   都沒有需要升級的觸發點。

## 執行順序

1. 先在本機完成階段 0 → 在自己的機器上以 OBS 確認 `?test=1` 疊加層可運作。
2. 註冊第 1–3、5 項帳號 → 以 `ECPAY_ENVIRONMENT=stage` 與 ECPay 測試金鑰部署 →
   執行 staging preflight → 在已部署的網址上完整跑一次測試金流的付款到 OBS 流程。
3. 申請真正的 ECPay 特店（唯一需要等待外部審核的步驟 —— 及早開始申請，
   與其他步驟並行進行）。
4. 換成 `ECPAY_ENVIRONMENT=production` 與真實帳務金鑰 → 完成一筆真實新台幣付款
   作為啟用證據（依 ROADMAP.md 的正式環境驗證關卡）→ 招募第一位外部實況主。
