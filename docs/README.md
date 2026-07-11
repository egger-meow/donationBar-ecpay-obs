# 📚 DonationBar Documentation

All guides organized by category.

## Authoritative direction

- [Taiwan-first roadmap](../ROADMAP.md)
- [Next direction](next-direction.md)
- [Claude Code cowork workflow](collaboration/CLAUDE_CODE_COWORK.md)

---

## 📖 Quick Links

- [Main README](../README.md) - Project overview
- [Complete Setup Guide](setup/COMPLETE_SETUP_GUIDE.md) - Full setup instructions
- [Subscription System](subscription/SUBSCRIPTION_IMPLEMENTATION.md) - ECPay subscription

---

## 📁 Documentation Structure

### 🔧 Setup & Configuration
Location: `docs/setup/`

- **[Complete Setup Guide](setup/COMPLETE_SETUP_GUIDE.md)** - End-to-end setup
- **[Google OAuth Setup](setup/GOOGLE_OAUTH_SETUP.md)** - Google OAuth 2.0 config
- **[Deployment Guide](setup/DEPLOYMENT.md)** - Production deployment

### 💳 Subscription System
Location: `docs/subscription/`

- **[Subscription Implementation](subscription/SUBSCRIPTION_IMPLEMENTATION.md)** - Complete subscription system docs
- **[ECPay Requirements](subscription/ECPAY_REQUIREMENTS.md)** - ECPay periodic payment specs (中文)

### 💾 Database
Location: `docs/database/`

- **[Database Schema (Original)](database/DATABASE-SCHEMA.md)** - Single-user schema
- **[Database Schema (Multi-user)](database/SCHEMA_MULTIUSER.md)** - Multi-user schema
- **[Schema Guide](database/SCHEMA-GUIDE.md)** - Quick reference

### 🔄 Migration
Location: `docs/migration/`

- **[Migration Guide](migration/MIGRATION_GUIDE.md)** - Step-by-step migration
- **[Migration Summary](migration/MIGRATION_SUMMARY.md)** - Migration changes overview

### ✨ Features
Location: `docs/features/`

- **[Authentication Features](features/AUTH_FEATURES_SUMMARY.md)** - Auth system overview
- **[Admin Panel Update](features/ADMIN_PANEL_UPDATE.md)** - Admin panel enhancements
- **[Auth Pages Styling](features/AUTH_PAGES_STYLING_UPDATE.md)** - UI styling updates
- **[Overlay Preview](features/OVERLAY_PREVIEW.md)** - Donation overlay features
- **[Webhook Setup](features/WEBHOOK_SETUP.md)** - ECPay webhook configuration
- **[Webhook Testing](features/TEST-WEBHOOK-README.md)** - Testing webhooks
- **[Easter Egg](features/EASTER_EGG.md)** - Secret free pass feature

### 🔌 API Reference
Location: `docs/api/`

- **[API Methods Reference](api/API_METHODS_REFERENCE.md)** - Complete API documentation

### 👨‍💻 Development
Location: `docs/development/`

- **[Server Updates](development/SERVER_UPDATE_SUMMARY.md)** - Server-side changes
- **[Changes Summary](development/CHANGES_SUMMARY.md)** - All project changes
- **[Sandbox Mode](development/SANDBOX.md)** - Testing in sandbox environment

---

## 🗺️ Documentation Map

```
docs/
├── README.md (this file)
├── setup/
│   ├── COMPLETE_SETUP_GUIDE.md
│   ├── GOOGLE_OAUTH_SETUP.md
│   └── DEPLOYMENT.md
├── subscription/
│   ├── SUBSCRIPTION_IMPLEMENTATION.md
│   └── ECPAY_REQUIREMENTS.md
├── database/
│   ├── DATABASE-SCHEMA.md
│   ├── SCHEMA_MULTIUSER.md
│   └── SCHEMA-GUIDE.md
├── migration/
│   ├── MIGRATION_GUIDE.md
│   └── MIGRATION_SUMMARY.md
├── features/
│   ├── AUTH_FEATURES_SUMMARY.md
│   ├── ADMIN_PANEL_UPDATE.md
│   ├── AUTH_PAGES_STYLING_UPDATE.md
│   ├── OVERLAY_PREVIEW.md
│   ├── WEBHOOK_SETUP.md
│   ├── TEST-WEBHOOK-README.md
│   └── EASTER_EGG.md
├── api/
│   └── API_METHODS_REFERENCE.md
└── development/
    ├── SERVER_UPDATE_SUMMARY.md
    ├── CHANGES_SUMMARY.md
    └── SANDBOX.md
```

---

## 🎯 Common Tasks

### New to the project?
1. [Main README](../README.md)
2. [Complete Setup Guide](setup/COMPLETE_SETUP_GUIDE.md)
3. [Database Schema](database/SCHEMA_MULTIUSER.md)

### Setting up subscriptions?
1. [Subscription Implementation](subscription/SUBSCRIPTION_IMPLEMENTATION.md)
2. [ECPay Requirements](subscription/ECPAY_REQUIREMENTS.md)

### Setting up authentication?
1. [Authentication Features](features/AUTH_FEATURES_SUMMARY.md)
2. [Google OAuth Setup](setup/GOOGLE_OAUTH_SETUP.md)

### Migrating from old version?
1. [Migration Guide](migration/MIGRATION_GUIDE.md)
2. [Migration Summary](migration/MIGRATION_SUMMARY.md)

### Working with the API?
1. [API Methods Reference](api/API_METHODS_REFERENCE.md)
2. [Server Updates](development/SERVER_UPDATE_SUMMARY.md)

### Deploying to production?
1. [Deployment Guide](setup/DEPLOYMENT.md)
2. [Webhook Setup](features/WEBHOOK_SETUP.md)

---

## 📝 Contributing

When adding new documentation:
- Place setup guides in `setup/`
- Place database docs in `database/`
- Place feature docs in `features/`
- Place API docs in `api/`
- Place dev notes in `development/`
- Update this README with new links

---

## 💡 Tips

- **Starting fresh?** → [Complete Setup Guide](setup/COMPLETE_SETUP_GUIDE.md)
- **Subscriptions?** → [Subscription Implementation](subscription/SUBSCRIPTION_IMPLEMENTATION.md)
- **Migrating?** → [Migration Guide](migration/MIGRATION_GUIDE.md)
- **Need API info?** → [API Reference](api/API_METHODS_REFERENCE.md)
- **Deploying?** → [Deployment Guide](setup/DEPLOYMENT.md)
- **Debugging?** → [Sandbox Mode](development/SANDBOX.md)

---

**Last Updated**: January 2026  
**Version**: Multi-user with OAuth + Subscription System
