# 📚 DonationBar Documentation

All guides organized by category. Some documents may be stale relative to the code —
verify behavior in `server.js`/`config.js`/`database.js` before relying on a doc for
setup or debugging. [PROGRESS.md](PROGRESS.md) records what has actually shipped and
when; use it (and `git log`) as the source of truth over any single feature doc.

## Authoritative direction

- [Zero to launch](setup/ZERO_TO_LAUNCH.md) — single linear checklist from local sandbox to first paying streamer, in Traditional Chinese; every other setup doc is reference material for one step of this path.
- [Taiwan-first roadmap](../ROADMAP.md) — priorities, what's shipped vs. proven, next actions.
- [Next direction](next-direction.md) — short framing of the current focus.
- [Progress log](PROGRESS.md) — running, append-only record of what has shipped.
- [Nekolive competitive analysis](competitive/NEKOLIVE_ANALYSIS.md) — direct-competitor comparison and the resulting do-not-build list.
- [Streamer interview guide](beta/STREAMER_INTERVIEW_GUIDE.md) — market-validation questions across five streamer segments.

---

## 📖 Quick Links

- [Main README](../README.md) - Project overview
- [Complete Setup Guide](setup/COMPLETE_SETUP_GUIDE.md) - Full setup instructions (Google OAuth-only auth)
- [Subscription System](subscription/SUBSCRIPTION_IMPLEMENTATION.md) - ECPay subscription

---

## 📁 Documentation Structure

### 🔧 Setup & Configuration
Location: `docs/setup/`

- **[Zero to Launch](setup/ZERO_TO_LAUNCH.md)** - The one linear path from local sandbox to first paying streamer (中文)
- **[Complete Setup Guide](setup/COMPLETE_SETUP_GUIDE.md)** - End-to-end setup
- **[Go-Live Free Checklist](setup/GO_LIVE_FREE_CHECKLIST.md)** - Accounts to register, production env vars, and the NT$0-first path to deployment
- **[Google OAuth Setup](setup/GOOGLE_OAUTH_SETUP.md)** - Google OAuth 2.0 config (the only supported login method)
- **[Deployment Guide](setup/DEPLOYMENT.md)** - Production deployment

### 💳 Subscription System
Location: `docs/subscription/`

- **[Subscription Implementation](subscription/SUBSCRIPTION_IMPLEMENTATION.md)** - Complete subscription system docs
- **[ECPay Requirements](subscription/ECPAY_REQUIREMENTS.md)** - ECPay periodic payment specs (中文)
- **[ECPay Setup Checklist](subscription/ECPAY_SETUP_CHECKLIST.md)** - Platform billing merchant setup steps

### 💾 Database
Location: `docs/database/`

- **[Database Schema (Original)](database/DATABASE-SCHEMA.md)** - Single-user schema
- **[Database Schema (Multi-user)](database/SCHEMA_MULTIUSER.md)** - Multi-user schema
- **[Schema Guide](database/SCHEMA-GUIDE.md)** - Quick reference

### 🔄 Migration
Location: `docs/migration/`

- **[Migration Guide](migration/MIGRATION_GUIDE.md)** - Step-by-step migration, backup/restore, rollback decision path
- **[Migration Summary](migration/MIGRATION_SUMMARY.md)** - Migration changes overview

### ✨ Features
Location: `docs/features/`

- **[Overlay Preview](features/OVERLAY_PREVIEW.md)** - Donation overlay features
- **[Webhook Setup](features/WEBHOOK_SETUP.md)** - ECPay webhook configuration
- **[Webhook Testing](features/TEST-WEBHOOK-README.md)** - Testing webhooks
- **[Easter Egg](features/EASTER_EGG.md)** - Secret free pass feature

### 🔌 API Reference
Location: `docs/api/`

- **[API Methods Reference](api/API_METHODS_REFERENCE.md)** - Complete API documentation

### 📈 Operations
Location: `docs/operations/`

- **[Monitoring and Incident Response](operations/MONITORING_AND_INCIDENT_RESPONSE.md)** - Health checks, structured logging, alert signals, severity/ownership
- **[Staging Preflight](operations/STAGING_PREFLIGHT.md)** - `npm run preflight:staging` reachability check
- **[Alert Exercise Template](operations/ALERT_EXERCISE_TEMPLATE.md)** - Template for recording an alert drill
- **[Beta Recruitment Draft](operations/BETA_RECRUITMENT_DRAFT.md)** - Unsent draft outreach message, screening checklist, week-1 questions

### 👨‍💻 Development
Location: `docs/development/`

- **[Sandbox Mode](development/SANDBOX.md)** - Testing in sandbox environment

### 🥊 Competitive analysis
Location: `docs/competitive/`

- **[Nekolive Network analysis](competitive/NEKOLIVE_ANALYSIS.md)** - Direct-competitor comparison, pricing crossover, and the resulting do-not-build list

### 🧪 Beta
Location: `docs/beta/`

- **[Streamer interview guide](beta/STREAMER_INTERVIEW_GUIDE.md)** - Market-validation questions across current/former Nekolive users, rejected applicants, direct-ECPay creators, and other-platform creators

---

## 🎯 Common Tasks

### New to the project?
1. [Main README](../README.md)
2. [Zero to Launch](setup/ZERO_TO_LAUNCH.md) - follow this step by step
3. [Database Schema](database/SCHEMA_MULTIUSER.md)

### Setting up subscriptions?
1. [Subscription Implementation](subscription/SUBSCRIPTION_IMPLEMENTATION.md)
2. [ECPay Requirements](subscription/ECPAY_REQUIREMENTS.md)

### Setting up authentication?
1. [Google OAuth Setup](setup/GOOGLE_OAUTH_SETUP.md) - the only supported login method
2. [Complete Setup Guide](setup/COMPLETE_SETUP_GUIDE.md)

### Migrating from old version?
1. [Migration Guide](migration/MIGRATION_GUIDE.md)
2. [Migration Summary](migration/MIGRATION_SUMMARY.md)

### Working with the API?
1. [API Methods Reference](api/API_METHODS_REFERENCE.md)

### Deploying to production?
1. [Deployment Guide](setup/DEPLOYMENT.md)
2. [Staging Preflight](operations/STAGING_PREFLIGHT.md)
3. [Monitoring and Incident Response](operations/MONITORING_AND_INCIDENT_RESPONSE.md)
4. [Webhook Setup](features/WEBHOOK_SETUP.md)

---

## 📝 Contributing

When adding new documentation:
- Place setup guides in `setup/`
- Place database docs in `database/`
- Place feature docs in `features/`
- Place API docs in `api/`
- Place operational docs in `operations/`
- Place dev notes in `development/`
- Update this README with new links
- Record what shipped in [PROGRESS.md](PROGRESS.md) rather than leaving a standalone
  `*_SUMMARY.md`/`*_UPDATE.md` doc — those go stale silently once the feature they
  describe changes again, and there is no process that revisits them. A dated entry in
  `PROGRESS.md` is explicitly historical, so it can't mislead a future reader into
  thinking it describes current behavior.

---

## 💡 Tips

- **Starting fresh?** → [Complete Setup Guide](setup/COMPLETE_SETUP_GUIDE.md)
- **Subscriptions?** → [Subscription Implementation](subscription/SUBSCRIPTION_IMPLEMENTATION.md)
- **Migrating?** → [Migration Guide](migration/MIGRATION_GUIDE.md)
- **Need API info?** → [API Reference](api/API_METHODS_REFERENCE.md)
- **Deploying?** → [Deployment Guide](setup/DEPLOYMENT.md)
- **Debugging?** → [Sandbox Mode](development/SANDBOX.md)
- **What actually shipped, and when?** → [Progress Log](PROGRESS.md)
