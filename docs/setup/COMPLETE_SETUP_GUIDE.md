# 🚀 Complete Multi-User Setup Guide

## Quick Start (5 Minutes)

### 1. Install Dependencies
```bash
npm install
```

This installs all new packages:
- `bcrypt` - Password hashing
- `nodemailer` - Email functionality  
- `passport` - OAuth support
- `uuid` - ID generation
- And more...

### 2. Configure Environment
Copy `.env.example` to `.env` or update your existing `.env`:

```bash
# Minimal for local testing
ENVIRONMENT=sandbox
ADMIN_EMAIL=admin@localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
SESSION_SECRET=dev-secret-key
ENCRYPTION_KEY=dev-encryption-key-32-chars!!
```

**Optional** - Add email (for password reset):
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
EMAIL_FROM=noreply@yourdomain.com
```

### 3. Run Migration
```bash
npm run migrate
```

Output:
```
🔄 Starting migration to multi-user schema...
🧪 Running migration in SANDBOX mode (JSON file)
✅ Migrated db.json to multi-user format
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Admin credentials:
   Email: admin@localhost
   Username: admin
   Password: admin123
✨ Migration completed successfully!
```

### 4. Start Server
```bash
npm start
```

Output:
```
🧪 Sandbox mode: Using local db.json file
🚀 DonationBar server running on port 3000
📊 Overlay URL: http://localhost:3000/overlay
💰 Donation page: http://localhost:3000/donate
⚙️  Admin panel: http://localhost:3000/admin
```

### 5. Test It Out!

#### Try Registration
1. Visit: http://localhost:3000/signup
2. Create a new account
3. Check email (if configured) or check logs

#### Try Login
1. Visit: http://localhost:3000/login
2. Login with ENV credentials:
   - Username: `admin`
   - Password: `admin123`

#### Try Password Reset
1. Visit: http://localhost:3000/forgot-password
2. Enter your email
3. Check email for reset link

---

## 📁 What You Have Now

### New Files Created

**Authentication Pages:**
- `public/signup.html` - User registration
- `public/forgot-password.html` - Password reset request
- `public/reset-password.html` - Set new password
- `public/login.html` - Updated with new links

**Backend:**
- `email.js` - Email service module
- `database-multiuser.js` - New database class (→ database.js)
- `migrations/migrate.js` - Multi-user migration script

**Documentation:**
- `AUTH_FEATURES_SUMMARY.md` - Authentication features
- `MIGRATION_GUIDE.md` - Migration instructions
- `SCHEMA_MULTIUSER.md` - Database schema reference
- `API_METHODS_REFERENCE.md` - API documentation
- `SERVER_UPDATE_SUMMARY.md` - Server changes
- `ENV_VARIABLES.md` - Environment variables
- `COMPLETE_SETUP_GUIDE.md` - This file

### Modified Files
- `package.json` - Added dependencies
- `server.js` - Added auth routes
- `database.js` - Multi-user version
- `.env.example` - Updated with new variables

---

## 🎯 Available Features

### ✅ Working Now
- [x] User registration with email
- [x] Email verification links
- [x] Password reset via email
- [x] Secure password hashing (bcrypt)
- [x] Multi-user support
- [x] Multi-workspace support
- [x] Subscription management
- [x] Workspace-scoped donations
- [x] ECPay integration per workspace
- [x] Backward compatible with old setup

### ⏳ Coming Soon (TODO)
- [ ] Database token storage (currently session-based)
- [ ] OAuth login (Google, GitHub)
- [ ] 2FA support
- [ ] Rate limiting on auth endpoints
- [ ] Account management UI
- [ ] Email preferences

---

## 🗺️ URL Structure

### Authentication
```
/signup                 - Registration page
/login                  - Login page
/forgot-password        - Password reset request
/reset-password         - Set new password (with token)
/verify-email           - Email verification (with token)
```

### API Endpoints
```
POST /api/auth/signup           - Register new user
POST /api/auth/forgot-password  - Request password reset
POST /api/auth/reset-password   - Update password
POST /login                     - Login (form submission)
POST /logout                    - Logout
```

### Main App
```
/admin                  - Admin panel (protected)
/overlay                - Overlay for OBS (default workspace)
/overlay/:slug          - Workspace-specific overlay
/donate                 - Donation page (default workspace)
/donate/:slug           - Workspace-specific donation
/webhook/:slug          - Workspace-specific webhook
```

---

## 📧 Email Setup (Optional)

### Gmail Configuration

1. **Enable 2FA on Gmail**
   ```
   Google Account → Security → 2-Step Verification
   ```

2. **Create App Password**
   ```
   Google Account → Security → App passwords
   Select "Mail" and generate password
   ```

3. **Add to .env**
   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=abcd efgh ijkl mnop  # Your app password
   EMAIL_FROM=noreply@yourdomain.com
   ```

### Test Email Sending

```bash
# Start server
npm start

# Visit signup page
http://localhost:3000/signup

# Register - check console logs
# You should see: "📧 Verification email sent to: xxx@xxx.com"
```

### Without Email (Sandbox Mode)

Emails will be logged to console instead:
```
📧 Email would be sent to: user@example.com (SMTP not configured)
```

Everything else works normally!

---

## 🔐 Security Checklist

### Development (Current)
- [x] Passwords hashed with bcrypt
- [x] Secure token generation
- [x] Session-based authentication
- [x] Password strength requirements
- [x] HTTPS-ready URLs

### Production (Recommended)
- [ ] Enable HTTPS
- [ ] Add rate limiting
- [ ] Store tokens in database
- [ ] Add CSRF protection
- [ ] Enable Helmet security headers
- [ ] Require email verification
- [ ] Add account lockout
- [ ] Use production-grade session store (Redis)
- [ ] Enable secure cookies
- [ ] Add logging and monitoring

---

## 🧪 Testing Guide

### Test Registration Flow

1. **Go to Signup**
   ```
   http://localhost:3000/signup
   ```

2. **Fill Form**
   - Email: test@example.com
   - Username: testuser
   - Display Name: Test User
   - Password: Test1234 (must meet requirements)
   - Confirm Password: Test1234
   - Check terms checkbox

3. **Submit**
   - Should see success message
   - Check console for email log
   - Redirects to login page

4. **Check Database**
   ```bash
   # View db.json
   cat db.json | jq .users
   
   # Should see new user with hashed password
   ```

### Test Password Reset

1. **Go to Forgot Password**
   ```
   http://localhost:3000/forgot-password
   ```

2. **Enter Email**
   - Email: test@example.com

3. **Check Console/Email**
   - Look for reset link
   - Copy token from URL

4. **Visit Reset Page**
   ```
   http://localhost:3000/reset-password?token=xxx
   ```

5. **Set New Password**
   - Password: NewPass123
   - Confirm: NewPass123
   - Submit

6. **Login with New Password**
   ```
   http://localhost:3000/login
   ```

---

## 📊 Database Structure

### Multi-User Tables

```
users                  - User accounts
subscriptions          - Plan management
user_workspaces        - Donation workspaces
workspace_settings     - Goals, overlay settings
payment_providers      - ECPay credentials
donations              - Workspace donations
api_keys               - API access
audit_logs             - Activity tracking
```

### Example: Find User's Workspace

```javascript
import database from './database.js';

// Get user
const user = await database.findUserByEmail('test@example.com');

// Get workspaces
const workspaces = await database.getUserWorkspaces(user.id);

// Get workspace settings
const settings = await database.getWorkspaceSettings(workspaces[0].id);

console.log('Workspace:', workspaces[0]);
console.log('Settings:', settings);
```

---

## 🐛 Common Issues

### Issue: "Cannot find module 'bcrypt'"
```bash
# Solution: Install dependencies
npm install
```

### Issue: "Default workspace not found"
```bash
# Solution: Run migration
npm run migrate
```

### Issue: Email not sending
```bash
# Check .env file has SMTP settings
# Verify Gmail app password is correct
# Check console logs for errors
# Emails are optional - app works without them
```

### Issue: "User already exists"
```bash
# Solution: Either use different email/username
# Or reset database: rm db.json and npm run migrate
```

---

## 🚀 Deployment Checklist

### Before Deploy

- [ ] Set `ENVIRONMENT=production`
- [ ] Set `DATABASE_URL` (PostgreSQL)
- [ ] Generate secure keys for:
  - [ ] `SESSION_SECRET`
  - [ ] `ENCRYPTION_KEY`
  - [ ] `JWT_SECRET`
- [ ] Configure SMTP for emails
- [ ] Set strong `ADMIN_PASSWORD`
- [ ] Update `BASE_URL` to production URL
- [ ] Enable HTTPS
- [ ] Add rate limiting
- [ ] Test all auth flows
- [ ] Backup database

### Generate Secure Keys
```bash
# Generate random keys
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Deploy to Render/Heroku
```bash
# All environment variables needed:
DATABASE_URL=postgresql://...
ENVIRONMENT=production
SESSION_SECRET=xxx
ENCRYPTION_KEY=xxx
JWT_SECRET=xxx
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=xxx
SMTP_PASS=xxx
EMAIL_FROM=noreply@yourdomain.com
BASE_URL=https://yourdomain.com
```

---

## 💡 Tips & Tricks

### Quickly Test Without Email

Set environment to sandbox and emails will just log:
```bash
ENVIRONMENT=sandbox
# No SMTP configuration needed!
```

### Reset Everything

```bash
# Remove database
rm db.json db.json.backup

# Run migration
npm run migrate

# Fresh start!
```

### View Current Users

```bash
# View db.json (sandbox mode)
cat db.json | jq .users

# Or use Node
node -e "import('./database.js').then(db => { /* queries */ })"
```

### Check Server Health

```bash
# Visit schema endpoint
curl http://localhost:3000/api/schema | jq
```

---

## 📚 Documentation Index

- **Migration**: `MIGRATION_GUIDE.md`
- **Schema**: `SCHEMA_MULTIUSER.md`
- **API**: `API_METHODS_REFERENCE.md`
- **Server**: `SERVER_UPDATE_SUMMARY.md`
- **Auth**: `AUTH_FEATURES_SUMMARY.md`
- **Env**: `ENV_VARIABLES.md`
- **This Guide**: `COMPLETE_SETUP_GUIDE.md`

---

## ✅ Success Checklist

- [x] Dependencies installed (`npm install`)
- [x] Environment configured (`.env`)
- [x] Migration run (`npm run migrate`)
- [x] Server starts (`npm start`)
- [x] Can access signup page
- [x] Can register new user
- [x] Can login
- [x] Can reset password
- [x] Existing features still work

---

## 🎉 You're Done!

Your DonationBar is now a **fully-featured multi-user platform** with:
- User authentication
- Email integration
- Multi-workspace support
- Subscription management
- Secure password handling
- Beautiful UI

**Next Steps:**
1. Test all features locally
2. Configure email (optional)
3. Deploy to production
4. Invite users to sign up!

---

**Questions?** Check the documentation files or review the code comments!

**Happy Streaming!** 🎮📺💰
