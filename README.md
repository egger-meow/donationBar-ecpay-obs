# Donatio (斗內條) — Programmable Stream Goal Overlay

> **English:** *Donatio — One goal. Every support source.*  
> **中文：** *斗內條 — 所有斗內，一條搞定。*  
> **Production Domain:** `https://donatio.jjmowlab.com`

🎮 **Programmable multi-source revenue & support goal for live streamers.**

整合綠界金流（ECPay）、Twitch、YouTube、Ko-fi 與通用 Webhook 的全方位 OBS 斗內進度條系統，支援 Cloudflare Workers 全球邊緣運算與即時 Server-Sent Events (SSE) 推播。

![Node](https://img.shields.io/badge/Node.js-18%2B-brightgreen) ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Hyperdrive-blue)

## ✨ 特色功能

- 🎯 **多來源一條整合** - 支援綠界、通用 Webhook 等多金流整合至單一 OBS 進度條
- ⚡ **Cloudflare Workers 邊緣運算** - 全球邊緣加速與 Hyperdrive PostgreSQL 連線池
- 📊 **即時進度推播** - Server-Sent Events (SSE) 零延遲推播至 OBS Browser Source
- 🎨 **美觀 OBS Overlay** - 透明背景、慶祝動畫、自訂音效與客製化外觀
- 🔒 **企業級安全架構** - 嚴格簽章驗證、等冪性儲存、無浮點數 ISO 4217 貨幣處理

## 🚀 快速開始

### 1. 環境需求

- Node.js 18.0+
- 綠界 ECPay 商店帳號
- 可外網存取的主機 (或使用 ngrok 測試)

### 2. 安裝步驟

```bash
# 1. 克隆專案
git clone <your-repo-url>
cd DonationBar-ecpay-obs

# 2. 安裝套件
npm install

# 3. 設定環境變數
cp .env.example .env
# 編輯 .env 檔案，填入你的綠界設定

# 4. 啟動服務
npm start
```

### 3. 綠界設定

在 `.env` 檔案中設定你的綠界參數：

```env
# 綠界商店設定
MERCHANT_ID=你的商店代號
HASH_KEY=你的HashKey
HASH_IV=你的HashIV

# 伺服器設定
PORT=3000
BASE_URL=https://your-domain.com  # 或 http://localhost:3000

# 目標設定
GOAL_TITLE=Gaming PC Goal
GOAL_AMOUNT=50000
```

### 4. OBS 設定

1. 開啟 OBS Studio
2. 新增來源 → Browser Source
3. URL 填入：`http://localhost:3000/overlay`
4. 寬度：900，高度：150
5. ✅ 勾選「透明背景」

## 📱 使用方式

### 觀眾捐款流程

1. 觀眾點擊捐款連結：`http://your-domain.com/donate`
2. 填寫暱稱和金額
3. 導向綠界付款頁面
4. 完成付款後自動更新進度條

### 實況主管理

訪問管理後台：`http://your-domain.com/admin`

- 📊 查看即時進度統計
- ⚙️ 設定募資目標金額和期間
- 📝 查看所有捐款記錄
- 🔄 重置進度 (新活動)

## 🎨 自訂外觀

### Overlay 顏色自訂

在 OBS Browser Source URL 加上參數：

```
http://localhost:3000/overlay?fg=%23ffffff&bg=%231a1a1a&bar=%2346e65a
```

參數說明：
- `fg` - 文字顏色 (需 URL encode)
- `bg` - 背景顏色
- `bar` - 進度條顏色
- `bar_light` - 進度條漸層色

### 測試模式

加上 `?test=1` 參數可進入測試模式，進度條會自動變化：

```
http://localhost:3000/overlay?test=1
```

## 🔧 API 文件

### 取得目前進度

```bash
GET /progress
```

回應：
```json
{
  "title": "Gaming PC Goal",
  "current": 12500,
  "goal": 50000,
  "percent": 25,
  "donations": [...]
}
```

### 即時更新 (SSE)

```bash
GET /events
```

Server-Sent Events 串流，即時推播進度更新。

### 管理 API

```bash
# 更新目標
POST /admin/goal
Content-Type: application/json

{
  "title": "新目標",
  "amount": 30000,
  "start": "2025-01-01",
  "end": "2025-01-31"
}

# 重置進度
POST /admin/reset
```

## 📚 完整文件

本專案包含完整的技術文件，所有文件已整理至 `docs/` 目錄：

- **[📖 完整文件索引](docs/README.md)** - 所有文件的導覽中心
- **[🚀 完整設定指南](docs/setup/COMPLETE_SETUP_GUIDE.md)** - 詳細安裝步驟
- **[🔐 Google OAuth 設定](docs/setup/GOOGLE_OAUTH_SETUP.md)** - OAuth 登入配置
- **[💾 資料庫結構說明](docs/database/SCHEMA_MULTIUSER.md)** - 多用戶資料庫架構
- **[🔄 系統遷移指南](docs/migration/MIGRATION_GUIDE.md)** - 版本升級說明
- **[🔌 API 參考文件](docs/api/API_METHODS_REFERENCE.md)** - 完整 API 說明

**查看所有文件** → [docs/README.md](docs/README.md)

## 📁 專案結構

```
DonationBar-ecpay-obs/
├── server.js              # 主要伺服器
├── package.json           # 套件設定
├── .env.example          # 環境變數範例
├── db.json               # 簡易資料庫
├── docs/                 # 📚 完整文件目錄
│   ├── README.md         # 文件導覽
│   ├── setup/            # 設定指南
│   ├── database/         # 資料庫文件
│   ├── migration/        # 遷移指南
│   ├── features/         # 功能說明
│   ├── api/              # API 文件
│   └── development/      # 開發文件
└── public/
    ├── overlay.html      # OBS Overlay 頁面
    ├── donate.html       # 捐款頁面
    ├── admin.html        # 管理後台
    ├── login.html        # 登入頁面
    ├── signup.html       # 註冊頁面
    ├── forgot-password.html  # 忘記密碼
    └── reset-password.html   # 重設密碼
```

## 🔒 安全注意事項

1. **CheckMacValue 驗證** - 已實作綠界官方驗證演算法
2. **重複付款防護** - 使用交易編號去重
3. **HTTPS 必需** - 正式環境請使用 HTTPS
4. **環境變數保護** - HashKey/HashIV 絕不可外洩

## 🚀 部署建議

### 使用 PM2 (推薦)

```bash
npm install -g pm2
pm2 start server.js --name "donation-bar"
pm2 startup
pm2 save
```

### 使用 Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔧 開發

```bash
# 開發模式 (自動重啟)
npm run dev

# 安裝開發套件
npm install --save-dev nodemon
```

## 📋 TODO / 擴充功能

- [ ] 支援多幣別換算
- [ ] 整合 Twitch 聊天機器人
- [ ] 新增音效提醒
- [ ] 資料庫升級至 PostgreSQL
- [ ] Docker 容器化
- [ ] 多目標同時進行

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

MIT License

## 💬 支援

如有問題請開 Issue 或聯繫作者。

---

⭐ **如果這個專案幫到你，請給個 Star！**
