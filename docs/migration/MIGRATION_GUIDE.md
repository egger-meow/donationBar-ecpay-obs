# Multi-User Migration Guide

This guide explains how to migrate your existing single-user donation bar application to the new multi-user schema.

## 📋 Overview

The migration process will:
- ✅ Create new multi-user database tables (users, workspaces, subscriptions, etc.)
- ✅ Migrate your existing donations and settings to a default workspace
- ✅ Create an admin user account
- ✅ Preserve all your existing data
- ✅ Support both PostgreSQL and JSON file modes

---

## 🚀 Quick Start (Sandbox Mode)

For testing locally with JSON file (recommended first step):

### Step 1: Install Dependencies

```bash
npm install
```

This will install all new packages including:
- `bcrypt` - Password hashing
- `passport` - Authentication
- `passport-google-oauth20` - Google OAuth
- `uuid` - UUID generation
- `helmet`, `cors`, `express-rate-limit` - Security

### Step 2: Set Environment Variables

Create or update your `.env` file:

```bash
# For sandbox mode
ENVIRONMENT=sandbox

# Admin credentials (will be created during migration)
ADMIN_EMAIL=admin@localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123  # CHANGE THIS!

# Security keys (generate random strings)
SESSION_SECRET=your-session-secret-key
ENCRYPTION_KEY=your-32-character-encryption-key!!
JWT_SECRET=your-jwt-secret-key
```

See `ENV_VARIABLES.md` for complete environment variable documentation.

### Step 3: Backup Your Data

```bash
# Backup your current db.json (if it exists)
copy db.json db.json.backup
```

### Step 4: Run Migration

```bash
npm run migrate
```

You should see output like:
```
🔄 Starting migration to multi-user schema...
🧪 Running migration in SANDBOX mode (JSON file)
✅ Backed up existing db.json to db.json.backup
✅ Migrated db.json to multi-user format

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Admin credentials:
   Email: admin@localhost
   Username: admin
   Password: admin123
   ⚠️  CHANGE THE PASSWORD AFTER FIRST LOGIN!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ Migration completed successfully!
```

### Step 5: Verify Migration

Start the server:
```bash
npm start
```

Your data should be accessible at:
- Admin panel: `http://localhost:3000/admin.html`
- Overlay: `http://localhost:3000/overlay/default`
- Donations: `http://localhost:3000/donate/default`

---

## 🐘 Production Mode (PostgreSQL)

For production with PostgreSQL database:

### Step 1: Set Environment Variables

Update your `.env` file:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database
ENVIRONMENT=production

# Admin credentials
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strong-password-here

# Security (use random strings!)
SESSION_SECRET=generate-random-secret-64-chars
ENCRYPTION_KEY=generate-random-secret-32-chars!!
JWT_SECRET=generate-random-secret-64-chars

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
```

**Generate secure random keys:**
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or OpenSSL
openssl rand -hex 32
```

### Step 2: Backup Your Database

```bash
# PostgreSQL backup
pg_dump your_database > backup_before_migration.sql
```

### Step 3: Run Migration

```bash
npm run migrate
```

The migration will:
1. Create all new tables (users, workspaces, subscriptions, etc.)
2. Migrate data from old tables (`app_data`, `donations`)
3. Create default admin user and workspace
4. Drop old tables after successful migration

### Step 4: Verify Migration

```bash
# Check if new tables exist
psql your_database -c "\dt"

# Should show:
# - users
# - subscriptions  
# - user_workspaces
# - workspace_settings
# - payment_providers
# - donations
# - api_keys
# - audit_logs
```

---

## 📊 What Gets Migrated

### Old Schema → New Schema

| Old | New |
|-----|-----|
| `app_data.goal_title` | `workspace_settings.goal_title` |
| `app_data.goal_amount` | `workspace_settings.goal_amount` |
| `app_data.goal_start_from` | `workspace_settings.goal_start_from` |
| `app_data.total` | `workspace_settings.total_amount` |
| `app_data.overlay_settings` | `workspace_settings.overlay_settings` |
| `app_data.ecpay_*` | `payment_providers.*` (ECPay entry) |
| `donations.trade_no` | `donations.trade_no` |
| `donations.amount` | `donations.amount` |
| `donations.payer` | `donations.payer_name` |
| `donations.message` | `donations.message` |
| `donations.created_at` | `donations.created_at` |

### New Entities Created

1. **Admin User**
   - Email from `ADMIN_EMAIL` env var
   - Username from `ADMIN_USERNAME` env var
   - Password from `ADMIN_PASSWORD` env var (hashed with bcrypt)

2. **Default Workspace**
   - Name: "Default Workspace"
   - Slug: "default"
   - URLs:
     - Donation: `/donate/default`
     - Overlay: `/overlay/default`
     - Webhook: `/webhook/default`

3. **Free Subscription**
   - Plan: "free"
   - Status: "active"
   - Linked to admin user

---

## 🔄 Rollback (If Needed)

### Sandbox Mode (JSON)

```bash
# Restore from backup
copy db.json.backup db.json
```

### PostgreSQL Mode

```bash
# Restore from SQL dump
psql your_database < backup_before_migration.sql
```

---

## 🧪 Testing the Migration

### 1. Check Database Structure

**Sandbox (JSON):**
```bash
# View the structure
cat db.json | jq .
```

**PostgreSQL:**
```bash
# Connect to database
psql your_database

# List tables
\dt

# Check user
SELECT * FROM users;

# Check workspaces
SELECT * FROM user_workspaces;

# Check donations
SELECT * FROM donations LIMIT 5;
```

### 2. Test Authentication

The new schema supports user authentication. While the full auth endpoints aren't implemented yet, you can verify the user exists:

**Using Node.js REPL:**
```javascript
node

> import('./database.js').then(async (db) => {
    const database = db.default;
    const user = await database.findUserByEmail('admin@localhost');
    console.log('User:', user);
    process.exit();
  });
```

### 3. Test Workspace Access

```javascript
node

> import('./database.js').then(async (db) => {
    const database = db.default;
    const workspace = await database.getWorkspaceBySlug('default');
    console.log('Workspace:', workspace);
    
    const settings = await database.getWorkspaceSettings(workspace.id);
    console.log('Settings:', settings);
    
    const donations = await database.getWorkspaceDonations(workspace.id, 5);
    console.log('Recent donations:', donations);
    
    process.exit();
  });
```

---

## 📝 New Database Methods

The updated `database.js` includes new methods:

### User Methods
```javascript
await database.createUser(userData)
await database.findUserByEmail(email)
await database.findUserByUsername(username)
await database.findUserById(userId)
await database.updateUserLastLogin(userId)
```

### Workspace Methods
```javascript
await database.createWorkspace(userId, workspaceData)
await database.getUserWorkspaces(userId)
await database.getWorkspaceBySlug(slug)
await database.getWorkspaceById(workspaceId)
```

### Workspace Settings Methods
```javascript
await database.getWorkspaceSettings(workspaceId)
await database.updateWorkspaceSettings(workspaceId, settings)
```

### Donation Methods (Workspace-Scoped)
```javascript
await database.addDonation(workspaceId, donationData)
await database.getWorkspaceDonations(workspaceId, limit)
await database.getWorkspaceProgress(workspaceId)
await database.clearWorkspaceDonations(workspaceId)
```

### Payment Provider Methods
```javascript
await database.getPaymentProvider(workspaceId, providerName)
await database.upsertPaymentProvider(workspaceId, providerData)
```

### Subscription Methods
```javascript
await database.getUserSubscription(userId)
await database.createSubscription(userId, subscriptionData)
```

---

## 🔐 Security Considerations

### Password Hashing
All passwords are hashed using **bcrypt** with 10 salt rounds. Never store plain passwords.

### Sensitive Data Encryption
ECPay credentials (merchant_id, hash_key, hash_iv) should be encrypted at rest in production. The schema supports this via the `credentials` JSONB field.

### Environment Variables
- Never commit `.env` to version control
- Use strong random values for secrets
- Rotate keys periodically

### API Keys
- Generated API keys are hashed using SHA-256
- Only the prefix is stored for identification
- Keys are shown once to the user, then stored as hashes

---

## ⚠️ Known Limitations

1. **Old `server.js` compatibility**: The existing `server.js` needs to be updated to use the new database methods. This migration only handles the database layer.

2. **Authentication endpoints**: You'll need to implement actual login/register endpoints (not included in this migration).

3. **Workspace routing**: URLs like `/overlay/:slug` need to be added to `server.js`.

4. **Backward compatibility**: Some old endpoints might break until `server.js` is updated to support workspace-scoped operations.

---

## 📚 Next Steps

After successful migration:

1. **Update `server.js`**
   - Add authentication routes (`/api/auth/login`, `/api/auth/register`)
   - Update existing routes to be workspace-scoped
   - Add workspace management endpoints

2. **Update Frontend**
   - Add login page
   - Add workspace selector
   - Update admin panel for multi-workspace support

3. **Implement OAuth**
   - Set up Google OAuth (if desired)
   - Configure OAuth callback routes

4. **Add Subscription Logic**
   - Implement plan limits checking
   - Add billing/payment integration

5. **Security Hardening**
   - Add rate limiting
   - Implement CORS properly
   - Add helmet for security headers
   - Enable CSRF protection

---

## 🆘 Troubleshooting

### Migration fails with "table already exists"
- Tables from new schema already exist
- Either drop them manually or the migration has already run
- Check: `SELECT * FROM users LIMIT 1;`

### "No DATABASE_URL found" in production
- Set `DATABASE_URL` environment variable
- Or set `ENVIRONMENT=sandbox` to use JSON file

### bcrypt installation fails
- May need build tools on Windows: `npm install --global windows-build-tools`
- Or use pre-built binaries: `npm rebuild bcrypt --build-from-source`

### UUID generation errors
- Make sure PostgreSQL has `pgcrypto` extension enabled
- Run: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`

### Donations not appearing
- Check workspace ID in donations table matches workspace_settings
- Verify `workspaceId` is correctly passed to `addDonation()`

---

## 📞 Support

For issues:
1. Check logs: `npm start` output
2. Check database: Query tables directly
3. Review `MIGRATION_GUIDE.md` (this file)
4. Check `ENV_VARIABLES.md` for configuration

---

## ✅ Migration Checklist

- [ ] Backed up existing data (`db.json` or PostgreSQL dump)
- [ ] Installed new dependencies (`npm install`)
- [ ] Set environment variables (`.env` file)
- [ ] Ran migration script (`npm run migrate`)
- [ ] Verified admin user created
- [ ] Verified workspace created
- [ ] Verified donations migrated
- [ ] Tested database access (Node.js REPL)
- [ ] Changed default admin password
- [ ] Updated `server.js` (next step)

---

**Migration Version:** 1.0.0  
**Date:** 2024  
**Schema Version:** Multi-User v1
