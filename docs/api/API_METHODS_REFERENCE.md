# Database API Methods Reference

Quick reference for the new multi-user database methods.

## 🔄 Method Changes: Old vs New

### Old (Single-User) Methods ❌

```javascript
// These methods NO LONGER EXIST
await database.readDB()
await database.writeDB(data)
await database.addDonation({tradeNo, amount, payer, message})
await database.clearAllDonations()
```

### New (Multi-User) Methods ✅

All operations are now **workspace-scoped**:

```javascript
// Get progress (replaces readDB)
await database.getWorkspaceProgress(workspaceId)

// Add donation (now requires workspaceId)
await database.addDonation(workspaceId, {
  tradeNo, amount, payerName, message, paymentProviderId
})

// Clear donations (now workspace-scoped)
await database.clearWorkspaceDonations(workspaceId)
```

---

## 👤 User Methods

### Create User
```javascript
const user = await database.createUser({
  email: 'user@example.com',
  username: 'streamer',
  passwordHash: 'bcrypt-hashed-password',
  displayName: 'Streamer Name',
  authProvider: 'local', // or 'google', 'github'
  oauthProviderId: null  // for OAuth users
});
// Returns: {id, email, username, displayName, ...}
```

### Find User by Email
```javascript
const user = await database.findUserByEmail('user@example.com');
// Returns: User object or null
```

### Find User by Username
```javascript
const user = await database.findUserByUsername('streamer');
// Returns: User object or null
```

### Find User by ID
```javascript
const user = await database.findUserById('uuid');
// Returns: User object or null
```

### Update Last Login
```javascript
await database.updateUserLastLogin(userId);
// Updates lastLoginAt timestamp
```

---

## 🏢 Workspace Methods

### Create Workspace
```javascript
const workspace = await database.createWorkspace(userId, {
  workspaceName: 'My Gaming Stream',
  slug: 'gaming-stream',  // Must be unique
  description: 'My awesome gaming donation bar'
});
// Returns: {id, userId, slug, donationUrl, overlayUrl, webhookUrl, ...}
// Automatically creates default workspace_settings
```

### Get User's Workspaces
```javascript
const workspaces = await database.getUserWorkspaces(userId);
// Returns: Array of workspace objects
```

### Get Workspace by Slug
```javascript
const workspace = await database.getWorkspaceBySlug('gaming-stream');
// Returns: Workspace object or null
```

### Get Workspace by ID
```javascript
const workspace = await database.getWorkspaceById('workspace-uuid');
// Returns: Workspace object or null
```

---

## ⚙️ Workspace Settings Methods

### Get Settings
```javascript
const settings = await database.getWorkspaceSettings(workspaceId);
// Returns: {
//   id, workspaceId,
//   goalTitle, goalAmount, goalStartFrom,
//   totalAmount, totalDonationsCount,
//   overlaySettings, customCss, customJs,
//   ...
// }
```

### Update Settings
```javascript
await database.updateWorkspaceSettings(workspaceId, {
  goalTitle: '新目標',
  goalAmount: 5000,
  goalStartFrom: 1000,
  overlaySettings: {
    fontSize: 12,
    fontColor: '#ff0000',
    // ... other overlay settings
  }
});
// Only updates provided fields
```

---

## 💳 Payment Provider Methods

### Get Payment Provider
```javascript
const provider = await database.getPaymentProvider(workspaceId, 'ecpay');
// Returns: {id, workspaceId, providerName, merchantId, hashKey, hashIV, ...}
```

### Create or Update Payment Provider
```javascript
const provider = await database.upsertPaymentProvider(workspaceId, {
  providerName: 'ecpay',
  merchantId: '3002607',
  hashKey: 'pwFHCqoQZGmho4w6',
  hashIV: 'EkRm7iFT261dpevs',
  isActive: true
});
// Creates if doesn't exist, updates if it does
```

---

## 💰 Donation Methods

### Add Donation
```javascript
const success = await database.addDonation(workspaceId, {
  tradeNo: 'DONATE1234567890',
  amount: 100,
  currency: 'TWD',  // Optional, default: 'TWD'
  payerName: '王小明',  // Optional, default: 'Anonymous'
  message: '加油！',  // Optional, default: ''
  paymentProviderId: 'provider-uuid'  // Optional
});
// Returns: true if added, false if duplicate
// Automatically updates totalAmount and totalDonationsCount
```

### Get Workspace Donations
```javascript
const donations = await database.getWorkspaceDonations(workspaceId, 10);
// Returns: Array of 10 most recent donations
// [
//   {id, tradeNo, amount, payerName, message, createdAt, ...},
//   ...
// ]
```

### Get Workspace Progress (like old readDB)
```javascript
const progress = await database.getWorkspaceProgress(workspaceId);
// Returns: {
//   goal: {title, amount, startFrom},
//   total: 1234,
//   donations: [{tradeNo, amount, payer, message, at}, ...],
//   overlaySettings: {...}
// }
```

### Clear All Donations
```javascript
await database.clearWorkspaceDonations(workspaceId);
// Deletes all donations for this workspace
// Resets totalAmount, totalDonationsCount, and goalStartFrom to 0
```

---

## 💳 Subscription Methods

### Get User Subscription
```javascript
const subscription = await database.getUserSubscription(userId);
// Returns: {
//   id, userId, planType, status,
//   isTrial, trialEndDate,
//   features, maxDonationsPerMonth, maxApiCallsPerDay,
//   ...
// }
```

### Create Subscription
```javascript
const subscription = await database.createSubscription(userId, {
  planType: 'free',  // 'free', 'trial', 'basic', 'pro'
  status: 'active',
  isTrial: false,
  trialEndDate: null
});
```

---

## 📝 Audit Log Methods

### Add Audit Log
```javascript
await database.addAuditLog({
  userId: 'user-uuid',          // Optional
  workspaceId: 'workspace-uuid', // Optional
  action: 'donation.received',
  resourceType: 'donation',     // Optional
  resourceId: 'donation-uuid',  // Optional
  status: 'success',            // 'success', 'failure', 'warning'
  metadata: {                   // Optional
    amount: 100,
    tradeNo: 'DONATE123'
  }
});
```

---

## 🔧 Utility Methods

### camelCaseKeys
```javascript
// Converts PostgreSQL snake_case to JavaScript camelCase
const camelCased = database.camelCaseKeys({
  user_id: 'uuid',
  created_at: '2024-01-01'
});
// Returns: {userId: 'uuid', createdAt: '2024-01-01'}
```

---

## 📖 Common Usage Examples

### Example 1: User Registration + Setup
```javascript
import bcrypt from 'bcrypt';
import database from './database.js';

// Hash password
const passwordHash = await bcrypt.hash('password123', 10);

// Create user
const user = await database.createUser({
  email: 'newuser@example.com',
  username: 'newuser',
  passwordHash,
  displayName: 'New User'
});

// Create subscription
await database.createSubscription(user.id, {
  planType: 'free',
  status: 'active'
});

// Create default workspace
const workspace = await database.createWorkspace(user.id, {
  workspaceName: 'My First Workspace',
  slug: 'my-first-workspace'
});

// Setup payment provider
await database.upsertPaymentProvider(workspace.id, {
  providerName: 'ecpay',
  merchantId: 'YOUR_MERCHANT_ID',
  hashKey: 'YOUR_HASH_KEY',
  hashIV: 'YOUR_HASH_IV'
});

console.log(`Workspace ready at: /overlay/${workspace.slug}`);
```

### Example 2: Login Flow
```javascript
import bcrypt from 'bcrypt';
import database from './database.js';

// Find user
const user = await database.findUserByEmail(email);
if (!user) {
  return res.status(401).json({error: 'Invalid credentials'});
}

// Verify password
const isValid = await bcrypt.compare(password, user.passwordHash);
if (!isValid) {
  return res.status(401).json({error: 'Invalid credentials'});
}

// Update last login
await database.updateUserLastLogin(user.id);

// Get user's workspaces
const workspaces = await database.getUserWorkspaces(user.id);

// Create session
req.session.userId = user.id;
res.json({user, workspaces});
```

### Example 3: Webhook Handler (Workspace-Scoped)
```javascript
import database from './database.js';

// Extract slug from URL: /webhook/gaming-stream
const slug = req.params.slug;

// Get workspace
const workspace = await database.getWorkspaceBySlug(slug);
if (!workspace) {
  return res.status(404).json({error: 'Workspace not found'});
}

// Get payment provider
const provider = await database.getPaymentProvider(workspace.id, 'ecpay');
if (!provider) {
  return res.status(404).json({error: 'Payment provider not configured'});
}

// Validate webhook using provider credentials
// ... ECPay validation logic ...

// Add donation
const success = await database.addDonation(workspace.id, {
  tradeNo: ecpayData.MerchantTradeNo,
  amount: ecpayData.TradeAmt,
  payerName: ecpayData.PayerName || 'Anonymous',
  message: ecpayData.Message || '',
  paymentProviderId: provider.id
});

if (success) {
  // Log the donation
  await database.addAuditLog({
    workspaceId: workspace.id,
    action: 'donation.received',
    resourceType: 'donation',
    status: 'success',
    metadata: {amount: ecpayData.TradeAmt, tradeNo: ecpayData.MerchantTradeNo}
  });
  
  res.send('1|OK');
} else {
  res.send('0|Duplicate');
}
```

### Example 4: Admin Panel Data Fetching
```javascript
import database from './database.js';

// Get workspace from slug
const slug = req.params.slug;
const workspace = await database.getWorkspaceBySlug(slug);

// Check user owns this workspace
if (workspace.userId !== req.session.userId) {
  return res.status(403).json({error: 'Unauthorized'});
}

// Get settings and recent donations
const settings = await database.getWorkspaceSettings(workspace.id);
const donations = await database.getWorkspaceDonations(workspace.id, 50);

res.json({
  workspace,
  settings,
  donations
});
```

### Example 5: Update Goal Settings
```javascript
import database from './database.js';

const {slug} = req.params;
const {goalTitle, goalAmount, goalStartFrom} = req.body;

// Get workspace
const workspace = await database.getWorkspaceBySlug(slug);

// Check ownership
if (workspace.userId !== req.session.userId) {
  return res.status(403).json({error: 'Unauthorized'});
}

// Update settings
await database.updateWorkspaceSettings(workspace.id, {
  goalTitle,
  goalAmount,
  goalStartFrom
});

res.json({success: true});
```

---

## 🔑 Key Differences Summary

| Operation | Old Method | New Method |
|-----------|-----------|------------|
| Get all data | `readDB()` | `getWorkspaceProgress(workspaceId)` |
| Save data | `writeDB(data)` | Individual update methods per entity |
| Add donation | `addDonation({...})` | `addDonation(workspaceId, {...})` |
| Get donations | From `readDB().donations` | `getWorkspaceDonations(workspaceId, limit)` |
| Clear donations | `clearAllDonations()` | `clearWorkspaceDonations(workspaceId)` |
| Get settings | From `readDB().overlaySettings` | `getWorkspaceSettings(workspaceId)` |
| Update settings | `writeDB(modifiedData)` | `updateWorkspaceSettings(workspaceId, {...})` |
| ECPay creds | From ENV or `readDB().ecpay` | `getPaymentProvider(workspaceId, 'ecpay')` |

---

## 💡 Tips

1. **Always use workspace-scoped methods** - No global operations anymore
2. **Check workspace ownership** - Verify `workspace.userId === currentUserId`
3. **Use camelCase** - All returned objects use camelCase keys
4. **Handle nulls** - Methods return `null` if entity not found
5. **Audit important actions** - Use `addAuditLog()` for security
6. **UUID everywhere** - All IDs are UUIDs, not integers

---

## 🚨 Breaking Changes

These old patterns **will not work**:

```javascript
// ❌ OLD - No longer works
const db = await database.readDB();
db.total += 100;
await database.writeDB(db);

// ✅ NEW - Correct way
const workspace = await database.getWorkspaceBySlug('default');
await database.addDonation(workspace.id, {
  tradeNo: 'DONATE123',
  amount: 100,
  payerName: 'Donor'
});
// Total is automatically updated
```

```javascript
// ❌ OLD - No longer works
await database.addDonation({
  tradeNo: 'DONATE123',
  amount: 100,
  payer: 'Donor',
  message: 'Hi!'
});

// ✅ NEW - Requires workspaceId
const workspace = await database.getWorkspaceBySlug('default');
await database.addDonation(workspace.id, {
  tradeNo: 'DONATE123',
  amount: 100,
  payerName: 'Donor',  // Note: payer → payerName
  message: 'Hi!'
});
```

---

**API Version:** Multi-User v1.0.0  
**Compatibility:** Not backward compatible with single-user schema
