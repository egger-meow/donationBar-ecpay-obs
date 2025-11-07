# Multi-User Database Schema Reference

## 📊 Schema Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     MULTI-USER ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────┐
│  users   │───────┐
└──────────┘       │
     │             │
     │ 1:1         │ 1:N
     │             │
     ▼             ▼
┌─────────────┐  ┌─────────────────┐
│subscriptions│  │ user_workspaces │
└─────────────┘  └─────────────────┘
                        │
                        │ 1:1
                        ├─────────────────────┐
                        │                     │
                        │ 1:N                 │ 1:N
                        ▼                     ▼
                 ┌──────────────────┐  ┌──────────────────┐
                 │workspace_settings│  │payment_providers │
                 └──────────────────┘  └──────────────────┘
                                              │
                                              │ 1:N
                                              ▼
                                       ┌──────────┐
                                       │donations │
                                       └──────────┘

┌──────────┐     ┌────────────┐
│ api_keys │     │ audit_logs │
└──────────┘     └────────────┘
     ▲                 ▲
     │                 │
     └─────────┬───────┘
               │
          Links to users
        and workspaces
```

---

## 📋 Tables

### 1. `users` - User Accounts

Stores all user accounts with authentication information.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `email` | VARCHAR(255) | Unique email address |
| `username` | VARCHAR(100) | Unique username |
| `password_hash` | VARCHAR(255) | Bcrypt hashed password (NULL for OAuth users) |
| `display_name` | VARCHAR(255) | Display name |
| `avatar_url` | TEXT | Profile picture URL |
| `auth_provider` | VARCHAR(20) | 'local', 'google', 'github', etc. |
| `oauth_provider_id` | VARCHAR(255) | External OAuth ID |
| `oauth_access_token` | TEXT | OAuth access token |
| `oauth_refresh_token` | TEXT | OAuth refresh token |
| `oauth_token_expires_at` | TIMESTAMP | Token expiration |
| `email_verified` | BOOLEAN | Email verification status |
| `is_active` | BOOLEAN | Account active status |
| `is_admin` | BOOLEAN | Platform admin flag |
| `created_at` | TIMESTAMP | Account creation time |
| `last_login_at` | TIMESTAMP | Last login time |
| `updated_at` | TIMESTAMP | Last update time |

**Indexes:**
- `idx_users_email` on `email`
- `idx_users_oauth_provider` on `(auth_provider, oauth_provider_id)`

**Constraints:**
- CHECK: Either local auth (with password_hash) OR OAuth (with oauth_provider_id)

---

### 2. `subscriptions` - User Subscriptions

Manages subscription plans and billing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key → users(id) |
| `plan_type` | VARCHAR(50) | 'free', 'trial', 'basic', 'pro', 'enterprise' |
| `status` | VARCHAR(20) | 'active', 'trial', 'expired', 'canceled', 'suspended' |
| `price_per_month` | INTEGER | Monthly price in cents |
| `currency` | VARCHAR(3) | 'TWD', 'USD', etc. |
| `payment_provider` | VARCHAR(50) | 'ecpay', 'stripe', 'paypal', etc. |
| `payment_provider_subscription_id` | VARCHAR(255) | External subscription ID |
| `is_trial` | BOOLEAN | Trial period flag |
| `trial_start_date` | TIMESTAMP | Trial start |
| `trial_end_date` | TIMESTAMP | Trial end |
| `current_period_start` | TIMESTAMP | Current billing period start |
| `current_period_end` | TIMESTAMP | Current billing period end |
| `canceled_at` | TIMESTAMP | Cancellation time |
| `max_donations_per_month` | INTEGER | Donation limit (NULL = unlimited) |
| `max_api_calls_per_day` | INTEGER | API call limit |
| `features` | JSONB | Feature flags |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Update time |

**Indexes:**
- `idx_subscriptions_user` on `user_id`
- `idx_subscriptions_status` on `status`
- `idx_subscriptions_trial_end` on `trial_end_date` WHERE `is_trial = TRUE`

**Constraints:**
- UNIQUE(`user_id`) - One subscription per user

---

### 3. `user_workspaces` - Donation Workspaces

Each user can have multiple workspaces (donation instances).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key → users(id) |
| `workspace_name` | VARCHAR(100) | Workspace name |
| `slug` | VARCHAR(100) | URL-friendly identifier (unique) |
| `description` | TEXT | Workspace description |
| `donation_url` | VARCHAR(255) | Custom donation URL |
| `overlay_url` | VARCHAR(255) | Overlay URL |
| `webhook_url` | VARCHAR(255) | Webhook endpoint URL |
| `is_active` | BOOLEAN | Active status |
| `is_public` | BOOLEAN | Public gallery visibility |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Update time |

**Indexes:**
- `idx_workspaces_user` on `user_id`
- `idx_workspaces_slug` on `slug`

**Constraints:**
- UNIQUE(`slug`) - Globally unique slug
- UNIQUE(`user_id`, `workspace_name`) - Unique name per user

---

### 4. `workspace_settings` - Workspace Configuration

Settings for each workspace (goals, overlay, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `workspace_id` | UUID | Foreign key → user_workspaces(id) |
| `goal_title` | VARCHAR(255) | Goal title |
| `goal_amount` | INTEGER | Target amount |
| `goal_start_from` | INTEGER | Starting amount |
| `goal_reset_frequency` | VARCHAR(20) | 'never', 'daily', 'weekly', 'monthly' |
| `goal_last_reset` | TIMESTAMP | Last reset time |
| `total_amount` | INTEGER | Total donations received |
| `total_donations_count` | INTEGER | Count of donations |
| `overlay_settings` | JSONB | OBS overlay settings |
| `custom_css` | TEXT | Custom CSS |
| `custom_js` | TEXT | Custom JavaScript |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Update time |

**Indexes:**
- `idx_workspace_settings_workspace` on `workspace_id`

**Constraints:**
- UNIQUE(`workspace_id`) - One settings record per workspace

**overlay_settings Structure:**
```json
{
  "showDonationAlert": true,
  "fontSize": 10,
  "fontColor": "#369bce",
  "backgroundColor": "#1a1a1a",
  "progressBarColor": "#46e65a",
  "progressBarHeight": 30,
  "progressBarCornerRadius": 15,
  "alertDuration": 5000,
  "position": "top-center",
  "width": 900,
  "alertEnabled": true,
  "alertSound": true,
  "donationDisplayMode": "top",
  "donationDisplayCount": 3
}
```

---

### 5. `payment_providers` - Payment Gateway Configuration

ECPay and other payment provider credentials per workspace.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `workspace_id` | UUID | Foreign key → user_workspaces(id) |
| `provider_name` | VARCHAR(50) | 'ecpay', 'newebpay', 'stripe', etc. |
| `is_active` | BOOLEAN | Active status |
| `is_sandbox` | BOOLEAN | Sandbox/test mode |
| `merchant_id` | VARCHAR(255) | Merchant ID |
| `hash_key` | VARCHAR(255) | Hash key (should be encrypted) |
| `hash_iv` | VARCHAR(255) | Hash IV (should be encrypted) |
| `credentials` | JSONB | Additional provider-specific credentials |
| `api_url` | TEXT | API endpoint URL |
| `webhook_secret` | VARCHAR(255) | Webhook verification secret |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Update time |

**Indexes:**
- `idx_payment_providers_workspace` on `workspace_id`

**Constraints:**
- UNIQUE(`workspace_id`, `provider_name`) - One provider per workspace

---

### 6. `donations` - Donation Records

Individual donation transactions (workspace-scoped).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `workspace_id` | UUID | Foreign key → user_workspaces(id) |
| `payment_provider_id` | UUID | Foreign key → payment_providers(id) |
| `trade_no` | VARCHAR(100) | Transaction ID from provider |
| `amount` | INTEGER | Donation amount |
| `currency` | VARCHAR(3) | Currency code (TWD, USD, etc.) |
| `payer_name` | VARCHAR(255) | Donor name |
| `message` | TEXT | Donor message |
| `status` | VARCHAR(20) | 'pending', 'completed', 'refunded', 'failed' |
| `payment_method` | VARCHAR(50) | 'credit_card', 'atm', 'cvs', etc. |
| `ip_address` | INET | Donor IP address |
| `user_agent` | TEXT | Donor user agent |
| `metadata` | JSONB | Additional provider-specific data |
| `created_at` | TIMESTAMP | Creation time |
| `completed_at` | TIMESTAMP | Completion time |
| `refunded_at` | TIMESTAMP | Refund time |

**Indexes:**
- `idx_donations_workspace` on `workspace_id`
- `idx_donations_trade_no` on `trade_no`
- `idx_donations_created_at` on `created_at DESC`
- `idx_donations_status` on `status`

**Constraints:**
- UNIQUE(`workspace_id`, `trade_no`) - No duplicate trades per workspace

---

### 7. `api_keys` - API Access Keys

API keys for programmatic access.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key → users(id) |
| `workspace_id` | UUID | Foreign key → user_workspaces(id) (NULL = user-level) |
| `key_name` | VARCHAR(100) | Key description |
| `key_hash` | VARCHAR(255) | SHA-256 hashed key |
| `key_prefix` | VARCHAR(20) | First chars for identification |
| `scopes` | TEXT[] | Permissions ['read', 'write', 'admin'] |
| `rate_limit` | INTEGER | Requests per day |
| `is_active` | BOOLEAN | Active status |
| `last_used_at` | TIMESTAMP | Last usage time |
| `usage_count` | INTEGER | Total usage count |
| `expires_at` | TIMESTAMP | Expiration time |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Update time |

**Indexes:**
- `idx_api_keys_user` on `user_id`
- `idx_api_keys_workspace` on `workspace_id`
- `idx_api_keys_hash` on `key_hash`

**Key Format:** `dk_live_abc123xyz...` (dk = donation_key)

---

### 8. `audit_logs` - Activity Logs

Track important actions for security and debugging.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key → users(id) |
| `workspace_id` | UUID | Foreign key → user_workspaces(id) |
| `action` | VARCHAR(100) | Action name ('user.login', 'donation.received') |
| `resource_type` | VARCHAR(50) | Resource type ('user', 'workspace', 'donation') |
| `resource_id` | UUID | Resource ID |
| `ip_address` | INET | Request IP |
| `user_agent` | TEXT | Request user agent |
| `metadata` | JSONB | Additional context |
| `status` | VARCHAR(20) | 'success', 'failure', 'warning' |
| `error_message` | TEXT | Error details (if failed) |
| `created_at` | TIMESTAMP | Log time |

**Indexes:**
- `idx_audit_logs_user` on `user_id`
- `idx_audit_logs_workspace` on `workspace_id`
- `idx_audit_logs_action` on `action`
- `idx_audit_logs_created_at` on `created_at DESC`

---

## 🔗 Relationships

### User → Subscriptions (1:1)
```sql
users.id → subscriptions.user_id
```
Each user has one active subscription.

### User → Workspaces (1:N)
```sql
users.id → user_workspaces.user_id
```
Each user can have multiple workspaces.

### Workspace → Settings (1:1)
```sql
user_workspaces.id → workspace_settings.workspace_id
```
Each workspace has one settings record.

### Workspace → Payment Providers (1:N)
```sql
user_workspaces.id → payment_providers.workspace_id
```
Each workspace can have multiple payment providers (ECPay, Stripe, etc.).

### Workspace → Donations (1:N)
```sql
user_workspaces.id → donations.workspace_id
```
Each workspace has many donations.

### Payment Provider → Donations (1:N)
```sql
payment_providers.id → donations.payment_provider_id
```
Each donation is linked to a payment provider.

### User → API Keys (1:N)
```sql
users.id → api_keys.user_id
```
Each user can have multiple API keys.

### Workspace → API Keys (1:N)
```sql
user_workspaces.id → api_keys.workspace_id
```
API keys can be scoped to specific workspaces.

---

## 📝 JSON File Structure (Sandbox Mode)

When using JSON file storage (`db.json`):

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "admin@localhost",
      "username": "admin",
      "passwordHash": "bcrypt-hash",
      "displayName": "Administrator",
      "avatarUrl": null,
      "authProvider": "local",
      "emailVerified": true,
      "isActive": true,
      "isAdmin": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastLoginAt": null,
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "subscriptions": [
    {
      "id": "uuid",
      "userId": "user-uuid",
      "planType": "free",
      "status": "active",
      "pricePerMonth": 0,
      "currency": "TWD",
      "isTrial": false,
      "features": {},
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "workspaces": [
    {
      "id": "uuid",
      "userId": "user-uuid",
      "workspaceName": "Default Workspace",
      "slug": "default",
      "description": null,
      "donationUrl": "/donate/default",
      "overlayUrl": "/overlay/default",
      "webhookUrl": "/webhook/default",
      "isActive": true,
      "isPublic": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "workspaceSettings": [
    {
      "id": "uuid",
      "workspaceId": "workspace-uuid",
      "goalTitle": "斗內目標",
      "goalAmount": 1000,
      "goalStartFrom": 0,
      "totalAmount": 0,
      "totalDonationsCount": 0,
      "overlaySettings": {},
      "customCss": null,
      "customJs": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "paymentProviders": [
    {
      "id": "uuid",
      "workspaceId": "workspace-uuid",
      "providerName": "ecpay",
      "isActive": true,
      "isSandbox": false,
      "merchantId": "3002607",
      "hashKey": "pwFHCqoQZGmho4w6",
      "hashIV": "EkRm7iFT261dpevs",
      "credentials": {},
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "donations": [
    {
      "id": "uuid",
      "workspaceId": "workspace-uuid",
      "paymentProviderId": "provider-uuid",
      "tradeNo": "DONATE1234567890",
      "amount": 100,
      "currency": "TWD",
      "payerName": "王小明",
      "message": "加油！",
      "status": "completed",
      "paymentMethod": null,
      "metadata": {},
      "createdAt": "2024-01-01T12:00:00.000Z",
      "completedAt": "2024-01-01T12:00:00.000Z",
      "refundedAt": null
    }
  ],
  "apiKeys": [],
  "auditLogs": []
}
```

---

## 🔒 Security Notes

1. **Password Hashing**: Use bcrypt with 10+ salt rounds
2. **API Key Storage**: Store SHA-256 hash, not the raw key
3. **Sensitive Credentials**: Encrypt `merchant_id`, `hash_key`, `hash_iv` in production
4. **OAuth Tokens**: Encrypt `oauth_access_token` and `oauth_refresh_token`
5. **Audit Everything**: Log all sensitive operations to `audit_logs`

---

## 📊 Key Differences from Single-User Schema

| Aspect | Old (Single-User) | New (Multi-User) |
|--------|------------------|------------------|
| Data scope | Global | Per workspace |
| Authentication | ENV variables | User accounts (bcrypt/OAuth) |
| Settings storage | Single `app_data` row | Per-workspace `workspace_settings` |
| ECPay credentials | ENV variables | Per-workspace `payment_providers` |
| Donations | Global table | Workspace-scoped with FK |
| URLs | Fixed paths | Dynamic per workspace slug |
| API access | No API keys | API key system with scopes |
| Audit trail | None | Full `audit_logs` table |

---

**Schema Version:** Multi-User v1.0.0  
**Last Updated:** 2024
