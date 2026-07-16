# Google OAuth 2.0 設定指南

本程式碼庫的登入方式**僅有** Google OAuth。沒有本機帳號密碼註冊、登入或重設密碼流程 ——
[public/](../../public/) 中並不存在 `signup.html` 或類似頁面。即使沙盒模式也是如此：
`ENVIRONMENT=sandbox` 只改變儲存後端（JSON 檔 vs. PostgreSQL），不會改變登入方式。
不論本機開發、預備環境或正式環境，你都需要一組能運作的 Google OAuth 用戶端。

## 已經實作好的部分（不需要再寫程式）

- Passport.js 的 `GoogleStrategy`，只有在 `GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET`
  皆已設定時才會註冊（[server.js](../../server.js)）。
- 路由：`GET /api/auth/google`（發起流程）與
  `GET /api/auth/google/callback`（處理 Google 導回的回呼）。
- 當某個 email 第一次登入時：會建立使用者（`authProvider: 'google'`、
  `emailVerified: true`、不設密碼雜湊）、一個工作區，以及一筆訂閱。會透過裝置指紋
  （device fingerprint）檢查，決定新帳號要給予 30 天試用，還是直接歸入免費方案，
  以防止同一裝置重複濫用試用資格。
- 當某個既有 email 再次登入時：直接登入該既有使用者並更新最後登入時間。
- 若登入失敗（使用者拒絕授權、`state` 驗證失敗等），會導回
  `/login?error=oauth_failed`，`login.html` 會讀取這個參數並顯示對應的錯誤提示。
- 登入成功後導向 `/admin`。

以上這些都不需要改程式碼 —— 你需要的是在 Google Cloud Console 申請一組真實的
OAuth 用戶端，並把產生的憑證填進你的環境變數。

## 步驟 1：建立 Google OAuth 2.0 用戶端

1. 前往 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)。
2. 建立或選擇一個專案（名稱任意，例如「DonationBar」）。
3. 若尚未設定過，請先設定 **OAuth 同意畫面（OAuth consent screen）**：
   - 使用者類型：External（外部）。
   - App 名稱、支援 email、開發人員聯絡 email。
   - 權限範圍（Scopes）：預設的 `email` 與 `profile` 即已足夠 —— 這個應用程式不會
     要求超出這兩項的權限。
   - 在 App 仍處於測試模式（testing）期間，把每一個你要用來登入的 Google 帳號都
     加進「測試使用者（Test users）」名單（你自己，以及之後若不同帳號的
     `ADMIN_EMAIL`）。
4. 前往 **憑證（Credentials）** → **建立憑證（Create Credentials）** →
   **OAuth 用戶端 ID（OAuth client ID）** → **網頁應用程式（Web application）**。
5. 設定 **已授權的 JavaScript 來源** 與 **已授權的重新導向 URI**：

   | 環境 | 來源（Origin） | 重新導向 URI |
   |---|---|---|
   | 本機 | `http://localhost:3000` | `http://localhost:3000/api/auth/google/callback` |
   | 正式環境 | `https://your-domain.example` | `https://your-domain.example/api/auth/google/callback` |

   重新導向 URI 必須與 `GOOGLE_CALLBACK_URL` **完全一致**，包含協定（scheme）。
6. 複製產生的 Client ID 與 Client Secret。

## 步驟 2：設定環境變數

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

正式環境請改用上表中的 HTTPS 值，並同時將 `BASE_URL` 設為相同網域 —— 完整的環境
變數對照表請見 [COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md)。

## 步驟 3：初始管理員設定（僅本機或首次部署需要）

`npm run migrate` 會依 `.env` 中的 `ADMIN_EMAIL`，建立初始的 `'default'` slug 工作區
與其擁有者帳號。請把 `ADMIN_EMAIL` 設為你打算用來登入的**該 Google 帳號的確切
email** —— 這個比對是在 OAuth 登入時依 email 進行，而不是靠任何密碼
（`ADMIN_PASSWORD` 雖會被儲存，但完全不用於登入）。

## 步驟 4：測試整個流程

1. `npm start`（或 `npm run dev`）。
2. 造訪 `http://localhost:3000/login`，點擊「使用 Google 帳號登入」。
3. 使用與 `ADMIN_EMAIL` 相符的 Google 帳號登入（若是非初始工作區，用任何帳號皆可）。
4. 應該會被導向 `/admin`。

## 疑難排解

- **「Google OAuth not configured」／點擊 Google 按鈕沒有反應** —— 缺少
  `GOOGLE_CLIENT_ID` 或 `GOOGLE_CLIENT_SECRET`；只有兩者都設定時才會註冊該登入策略。
- **Redirect URI 不符（Redirect URI mismatch）** —— Google 拒絕的那個 URI，必須
  逐字（包含結尾是否有斜線）加進 Google Cloud Console 的「已授權的重新導向 URI」。
- **被導回 `/login?error=oauth_failed`** —— 使用者拒絕授權、`state` 參數驗證失敗，
  或憑證設定錯誤。請查看伺服器日誌（session 內容刻意不會被記錄，但失敗事件本身
  會被記錄）。
- **「This app hasn't been verified」（此應用程式尚未經過驗證）** —— 在 OAuth
  同意畫面仍處於測試模式時屬於預期現象。開發階段可點選「進階
  （Advanced）→ 前往（App 名稱）（不安全）」繼續。並在同意畫面設定中的
  「測試使用者」加入每一位測試者帳號。只有在正式公開、非測試使用者上線前，
  才需要提交 Google 驗證。
- **登入成功但工作區不對／不是管理員** —— `.env` 中的 `ADMIN_EMAIL` 必須與
  Google 帳號 email 完全一致，且這個比對只會依 `npm run migrate` 當時建立的狀態
  進行，之後才改 `ADMIN_EMAIL` 不會回溯生效。

## 正式環境檢查清單

- [ ] Google Cloud Console 的「已授權的 JavaScript 來源」與「已授權的重新導向
      URI」皆已加入正式網域。
- [ ] `GOOGLE_CALLBACK_URL` 與 `BASE_URL` 皆使用真實的 HTTPS 網域。
- [ ] 若需要讓自己測試帳號以外的真實使用者登入，OAuth 同意畫面已脫離測試模式
      （或每個真實使用者都已加入測試使用者名單）。
- [ ] 已針對真正部署上線的網域（而非僅 `localhost`）完整測試過一次 OAuth 流程。
