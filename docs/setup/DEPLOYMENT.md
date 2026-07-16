# 正式環境部署

DonationBar 以 Node.js 服務與正式環境容器的形式部署。正式環境中 PostgreSQL 與 HTTPS
為必要條件。若必要設定或 PostgreSQL 無法使用，啟動流程會直接失敗；絕不會回退使用
`db.json`。

## 所需基礎設施

- 容器環境或 Node.js 20 執行環境
- 具備自動備份與可用時支援時間點還原（point-in-time recovery）的 PostgreSQL
- 會轉發 `X-Forwarded-Proto` 的 HTTPS 反向代理
- 供 OAuth 與 ECPay callback 使用的公開穩定網域
- 集中化的應用程式日誌與正常運行監控（uptime monitor）

## 必要設定

以 `.env.example` 為起點。正式環境至少需要：

```dotenv
NODE_ENV=production
ENVIRONMENT=production
ECPAY_ENVIRONMENT=stage
BASE_URL=https://your-domain.example
DATABASE_URL=postgresql://...
SESSION_SECRET=a-random-secret-at-least-32-characters-long
CREDENTIAL_ENCRYPTION_KEY=a-base64-encoded-random-32-byte-key
PLATFORM_ADMIN_EMAILS=owner@example.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://your-domain.example/api/auth/google/callback
BILLING_ECPAY_MERCHANT_ID=...
BILLING_ECPAY_HASH_KEY=...
BILLING_ECPAY_HASH_IV=...
```

實況主的收款金鑰是逐工作區輸入的。切勿把實況主的金鑰放進平台帳務的環境變數。
`npm run migrate` 會用 `CREDENTIAL_ENCRYPTION_KEY` 加密既有 PostgreSQL 中的金鑰；
請將該金鑰保存在受管理的密鑰保管庫，並在備份中一併保留 —— 遺失這把金鑰會導致
無法解密。

## 加密備份與還原

在維運用的執行環境上安裝 PostgreSQL 客戶端工具（`pg_dump` 與 `pg_restore`）。
在密鑰保管庫中保存一組隨機 32 位元組的 `BACKUP_ENCRYPTION_KEY`，並與備份檔分開存放。
在不覆蓋既有檔案的情況下建立備份：

```bash
npm run backup -- backups/donationbar-2026-07-11.dump.enc
```

還原時只能指向明確選定的資料庫。還原動作使用 `--clean --if-exists`，具破壞性，
因此需要明確的確認變數：

```bash
ALLOW_DATABASE_RESTORE=yes npm run restore -- backups/donationbar-2026-07-11.dump.enc
```

還原流程會先驗證整份加密備份，再呼叫 `pg_restore`，過程中使用私有的暫存 dump 檔，
完成後即刪除。因此錯誤的金鑰或被竄改的備份檔，會在資料庫真正被變更之前就先失敗。

每次 schema 發版後，都要在獨立的預備資料庫上演練還原流程。驗證
`/health/ready`、工作區／使用者數量，以及至少一筆去識別化的捐款紀錄與訂閱紀錄。
記錄耗時與證據，之後刪除該暫存資料庫。備份在通過這道還原演練之前都不算真正可靠。

## 建置與發版

```bash
docker build -t donationbar:release .
docker run --rm --env-file .env donationbar:release npm run migrate
docker run --env-file .env -p 3000:3000 donationbar:release
```

在切換流量到新版本之前，先以發版作業（release job）的形式執行 `npm run migrate`。
不要同時併行執行多個 migration 作業。

設定探測（probes）：

- Liveness：`GET /health/live`
- Readiness：`GET /health/ready`

只有 readiness 檢查會查詢 PostgreSQL。只要 readiness 回傳 HTTP 503，就應將該實例移出
流量。

## 金流服務商設定

向平台帳務用特店登記以下 HTTPS 端點：

- 首次付款通知：`https://your-domain.example/ecpay/return`
- 週期性付款通知：`https://your-domain.example/ecpay/period/callback`

將 Google OAuth 的 callback 設為與 `GOOGLE_CALLBACK_URL` 完全一致的網址。
第一次發版請使用 ECPay 測試金鑰並設定 `ECPAY_ENVIRONMENT=stage`；只有在完成
簽章驗證、重複 callback、模擬付款、取消付款、付款失敗等測試都通過後，才將該變數
切換為 `production`。

## 備份與回退（Rollback）

每次資料庫 migration 之前：

1. 建立並驗證一份 PostgreSQL 快照。
2. 記錄應用程式映像檔標籤（image tag）與 migration 的 commit。
3. 執行 migration 發版作業。
4. 驗證 readiness、登入、試用權限、訂閱結帳、捐款結帳、OBS 疊加層重新連線。

目前的 migration 皆為附加式（additive）且向前相容。應用程式回退指的是重新部署
前一個映像檔，同時保留已附加的 schema 不變。若某次 migration 造成資料損毀，
應立即停止寫入並還原 migration 前的 PostgreSQL 快照；不要對正式付款資料嘗試
臨時拼湊的反向 migration。

## 上線前驗證

- `npm test` 通過，且 `npm audit --omit=dev` 未回報漏洞。
- 缺少 PostgreSQL 或必要金鑰時，正式環境啟動會直接失敗。
- Session 在應用程式重啟與多實例情況下都能維持。
- ECPay 測試付款只會啟用一次；重放（replay）同一筆 callback 不會建立第二筆付款。
- 取消動作會先在 ECPay 端成功，才會更新本地狀態。
- 試用、已付費、於週期中取消、已過期等各種存取狀態皆已驗證。
- OBS 瀏覽器來源（Browser Source）能以透明背景載入，能在中斷後重新連線，並能處理
  較長的在地化文字。
- 桌面版與行動版的捐款／管理頁面皆已人工檢查。
- Readiness 失敗與週期性 callback 錯誤都設有告警。
