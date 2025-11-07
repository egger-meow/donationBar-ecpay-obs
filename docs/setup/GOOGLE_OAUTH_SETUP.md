# Google OAuth 2.0 Setup Guide

## ✅ Implementation Complete

Google OAuth 2.0 login and sign-up functionality has been successfully added to your DonationBar application!

---

## 🎯 What Was Added

### 1. **Backend Configuration**
- ✅ Passport.js integration
- ✅ Google OAuth 2.0 strategy
- ✅ User serialization/deserialization
- ✅ Automatic user creation for new Google users
- ✅ Automatic workspace and subscription creation
- ✅ OAuth callback handling

### 2. **Frontend Updates**
- ✅ "使用 Google 帳號登入" button on login page
- ✅ "使用 Google 帳號註冊" button on signup page
- ✅ Google logo with authentic colors
- ✅ Professional button styling
- ✅ Error handling for OAuth failures

### 3. **New Routes**
```javascript
GET  /api/auth/google           // Initiate Google OAuth
GET  /api/auth/google/callback  // Handle OAuth callback
```

---

## 🔧 Setup Instructions

### Step 1: Get Google OAuth Credentials

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create or Select a Project**
   - Click "Select a project" → "New Project"
   - Name it: "DonationBar" (or your preferred name)
   - Click "Create"

3. **Enable Google+ API**
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Select "Web application"
   
5. **Configure OAuth Consent Screen**
   - Go to "OAuth consent screen"
   - User Type: "External" (for testing) or "Internal" (for organization)
   - Fill in:
     - App name: DonationBar
     - User support email: your-email@example.com
     - Developer contact: your-email@example.com
   - Click "Save and Continue"
   - Scopes: Add `email` and `profile` (default)
   - Test users: Add your Google account email
   - Click "Save and Continue"

6. **Set Authorized URIs**
   
   **Authorized JavaScript origins:**
   ```
   http://localhost:3000
   https://yourdomain.com  (for production)
   ```
   
   **Authorized redirect URIs:**
   ```
   http://localhost:3000/api/auth/google/callback
   https://yourdomain.com/api/auth/google/callback  (for production)
   ```

7. **Get Your Credentials**
   - Copy the "Client ID"
   - Copy the "Client Secret"

---

### Step 2: Configure Environment Variables

Add to your `.env` file:

```bash
# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# For production:
# GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
```

### Step 3: Restart Server

```bash
npm start
```

You should see:
```
✅ Google OAuth strategy configured
```

If not configured:
```
⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
```

---

## 🚀 How It Works

### User Flow

1. **User clicks "使用 Google 帳號登入"**
   ```
   User → /api/auth/google
   ```

2. **Redirect to Google**
   ```
   User redirected to Google login page
   Requested scopes: profile, email
   ```

3. **User authorizes**
   ```
   User logs in and authorizes DonationBar
   ```

4. **Google redirects back**
   ```
   Google → /api/auth/google/callback?code=xxx
   ```

5. **Backend processes**
   ```javascript
   - Passport exchanges code for tokens
   - Retrieves user profile
   - Checks if user exists by email
   - If new: Creates user, workspace, subscription
   - If exists: Logs in existing user
   - Sets session
   - Redirects to /admin
   ```

---

## 📝 Technical Details

### Passport Configuration

```javascript
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    // User creation/lookup logic
  }
));
```

### User Creation for New Google Users

```javascript
user = await database.createUser({
  email: profile.emails[0].value,
  username: email.split('@')[0] + '-' + Date.now(),
  passwordHash: null,  // OAuth users don't need passwords
  displayName: profile.displayName,
  authProvider: 'google',
  oauthProviderId: profile.id,
  emailVerified: true  // Google emails are pre-verified
});

// Auto-create free subscription
await database.createSubscription(user.id, {
  planType: 'free',
  status: 'active'
});

// Auto-create workspace
await database.createWorkspace(user.id, {
  workspaceName: `${profile.displayName}'s Workspace`,
  slug: username.toLowerCase()
});
```

---

## 🎨 UI Components

### Login Button (login.html)

```html
<a href="/api/auth/google" class="btn btn-google">
    <svg><!-- Google logo --></svg>
    使用 Google 帳號登入
</a>
```

**Styling:**
```css
.btn-google {
  background: #ffffff;
  color: #444;
  border: 2px solid #e1e8ed;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### Signup Button (signup.html)

```html
<a href="/api/auth/google" class="btn btn-google">
    <svg><!-- Google logo --></svg>
    使用 Google 帳號註冊
</a>
```

---

## 🔐 Security Features

### Implemented

- ✅ **OAuth 2.0 Standard** - Industry-standard authentication
- ✅ **No password storage** for OAuth users
- ✅ **Email pre-verified** from Google
- ✅ **Session-based** authentication
- ✅ **CSRF protection** via state parameter (Passport handles)
- ✅ **Secure token exchange** (server-side only)

### Best Practices

- ✅ Client secret stored in environment variables
- ✅ Callback URL validated by Google
- ✅ No sensitive data in frontend
- ✅ Automatic user creation with secure defaults

---

## 🧪 Testing

### Local Testing

1. **Start server**
   ```bash
   npm start
   ```

2. **Visit login page**
   ```
   http://localhost:3000/login
   ```

3. **Click "使用 Google 帳號登入"**

4. **Authorize with Google**
   - Select Google account
   - Approve permissions

5. **Redirected to admin panel**
   ```
   http://localhost:3000/admin
   ```

### Check Console Logs

**Successful flow:**
```
✅ Google OAuth strategy configured
✅ New user created via Google OAuth: user@gmail.com
```

**Existing user:**
```
ℹ️ User user@gmail.com logging in with Google
```

---

## 🐛 Troubleshooting

### Issue: "Google OAuth not configured"

**Cause:** Missing environment variables

**Solution:**
```bash
# Check .env file has:
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

### Issue: "Redirect URI mismatch"

**Cause:** Callback URL not authorized in Google Console

**Solution:**
1. Go to Google Cloud Console → Credentials
2. Click your OAuth 2.0 Client ID
3. Add to "Authorized redirect URIs":
   ```
   http://localhost:3000/api/auth/google/callback
   ```
4. Save

### Issue: "OAuth failed" error

**Possible causes:**
- User denied permission
- Network error
- Invalid credentials
- Callback URL mismatch

**Solution:**
1. Check console logs for specific error
2. Verify credentials in .env
3. Check authorized URIs in Google Console
4. Try again

### Issue: User sees "This app hasn't been verified"

**Cause:** App in testing mode with external users

**Solution:**
1. **For development:** Click "Advanced" → "Go to DonationBar (unsafe)"
2. **For production:** Submit for Google verification

---

## 📊 Database Schema Changes

### Users Table

OAuth users are created with:
```javascript
{
  email: 'user@gmail.com',
  username: 'user-1234567890',
  passwordHash: null,           // No password for OAuth
  displayName: 'John Doe',
  authProvider: 'google',       // or 'local'
  oauthProviderId: '12345...',  // Google user ID
  emailVerified: true           // Auto-verified
}
```

---

## 🔄 Migration Path

### Existing Local Users

Users with local auth can still use Google OAuth:

```javascript
// If user exists with local auth
if (user.authProvider !== 'google') {
  console.log('User logging in with Google (originally local auth)');
  // User can use both methods
}
```

**Result:** User can log in with both:
- Username/password (original method)
- Google OAuth (new method)

---

## 🌐 Production Deployment

### Checklist

- [ ] Update Google Console with production domain
- [ ] Add production callback URL to authorized URIs
- [ ] Set `GOOGLE_CALLBACK_URL` in production .env
- [ ] Enable HTTPS (required for OAuth)
- [ ] Update `BASE_URL` to production URL
- [ ] Test OAuth flow on production
- [ ] Submit app for Google verification (optional)

### Production .env

```bash
# Production settings
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
BASE_URL=https://yourdomain.com
```

---

## 📚 Resources

### Google Documentation
- [OAuth 2.0 Setup](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
- [OAuth Scopes](https://developers.google.com/identity/protocols/oauth2/scopes)

### Passport.js
- [Passport Google OAuth](http://www.passportjs.org/packages/passport-google-oauth20/)
- [Passport Documentation](http://www.passportjs.org/docs/)

---

## ✨ Features

### What Users Get

- 🚀 **One-click signup** - No form filling required
- ✅ **Pre-verified email** - Skip verification step
- 🔒 **Secure** - No password to remember
- ⚡ **Fast** - Instant account creation
- 🌐 **Familiar** - Standard Google login flow

### What You Get

- 📈 **Higher conversion** - Easier signup = more users
- 🔐 **Better security** - OAuth 2.0 standard
- 📧 **Valid emails** - Google-verified addresses
- 🚫 **No spam accounts** - Harder to fake
- 📊 **User data** - Profile info from Google

---

## 🎯 Summary

**Status**: ✅ **Fully Implemented**

**Added:**
- ✅ Passport.js with Google OAuth strategy
- ✅ Google login buttons on login/signup pages
- ✅ Automatic user/workspace creation
- ✅ Session management
- ✅ Error handling
- ✅ Professional UI

**Next Steps:**
1. Get Google OAuth credentials
2. Add to `.env` file
3. Restart server
4. Test login flow

**Users can now sign in with Google in one click!** 🎉
