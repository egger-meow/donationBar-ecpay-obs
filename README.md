# DonationBar ECPay OBS

🎮 **ECPay 綠界金流 + OBS 捐款進度條系統**

一套完整的台灣實況主捐款解決方案，支援綠界金流並提供即時更新的 OBS 進度條 overlay。

![Demo](https://img.shields.io/badge/Status-Ready%20to%20Use-brightgreen) ![Node](https://img.shields.io/badge/Node.js-18%2B-brightgreen) ![ECPay](https://img.shields.io/badge/ECPay-Supported-orange)

## ✨ 特色功能

- 🏦 **綜界金流整合** - 支援信用卡、ATM、超商付款
- 📊 **即時進度條** - Server-Sent Events 即時更新，無需重新整理
- 🎨 **美觀 OBS Overlay** - 透明背景、動畫效果、可自訂顏色
- 📱 **響應式設計** - 手機、桌面完美支援
- ⚡ **零延遲更新** - 付款完成立即更新進度條
- 🔧 **管理後台** - 輕鬆設定目標金額、查看捐款記錄
- 🎯 **目標導向** - 設定募資目標，追蹤達成進度

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

## 📁 專案結構

```
DonationBar-ecpay-obs/
├── server.js              # 主要伺服器
├── package.json           # 套件設定
├── .env.example          # 環境變數範例
├── db.json               # 簡易資料庫
└── public/
    ├── overlay.html      # OBS Overlay 頁面
    ├── donate.html       # 捐款頁面
    └── admin.html        # 管理後台
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
