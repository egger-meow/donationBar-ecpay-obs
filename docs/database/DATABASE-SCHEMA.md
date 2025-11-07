# Database Schema Documentation

## Overview

The application supports two storage modes:
- **JSON File** (`db.json`) - Used in sandbox/development mode
- **PostgreSQL** - Used in production mode

## New Schema Functions

### `getDatabaseSchema(queryActual)`

Returns a comprehensive schema object containing table definitions, relationships, and data flow information.

**Parameters:**
- `queryActual` (boolean) - If true and connected to PostgreSQL, queries the actual database schema

**Returns:** Object with:
- `storageMode` - Current storage mode (JSON File or PostgreSQL)
- `connected` - Database connection status
- `tables` - Complete table definitions
- `relationships` - Table relationships and foreign key information
- `jsonStructure` - JSON file structure (when using file storage)
- `dataFlow` - Data flow and processing information

**Usage:**
```javascript
import database from './database.js';

// Get schema definition
const schema = await database.getDatabaseSchema();
console.log(schema.tables.donations);

// Query actual PostgreSQL schema (only works if connected)
const actualSchema = await database.getDatabaseSchema(true);
```

### `printDatabaseSchema(queryActual)`

Prints a formatted, human-readable version of the database schema to console.

**Parameters:**
- `queryActual` (boolean) - If true and connected to PostgreSQL, queries the actual database schema

**Usage:**
```javascript
import database from './database.js';

// Print schema to console
await database.printDatabaseSchema();

// Or use the helper script
// node show-schema.js
```

## Database Tables

### Table: `donations`

Stores individual donation records from ECPay.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing donation ID |
| `trade_no` | VARCHAR(50) | UNIQUE NOT NULL | Unique trade number from ECPay |
| `amount` | INTEGER | NOT NULL | Donation amount in TWD |
| `payer` | VARCHAR(255) | DEFAULT 'Anonymous' | Name of the donor |
| `message` | TEXT | DEFAULT '' | Message from the donor |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | When the donation was created |

**Indexes:**
- `donations_pkey` - PRIMARY KEY on `id`
- `donations_trade_no_key` - UNIQUE on `trade_no`

### Table: `app_data`

Stores application configuration (single row table with id='main').

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR(20) | PRIMARY KEY | Single row identifier (always 'main') |
| `goal_title` | VARCHAR(255) | DEFAULT '斗內目標' | Title of the donation goal |
| `goal_amount` | INTEGER | DEFAULT 1000 | Target donation amount |
| `goal_start_from` | INTEGER | DEFAULT 0 | Starting amount for progress bar |
| `total` | INTEGER | DEFAULT 0 | Total donations received |
| `seen_trade_nos` | TEXT[] | DEFAULT '{}' | Array of processed trade numbers |
| `ecpay_merchant_id` | VARCHAR(255) | DEFAULT '' | ECPay merchant ID |
| `ecpay_hash_key` | VARCHAR(255) | DEFAULT '' | ECPay hash key for encryption |
| `ecpay_hash_iv` | VARCHAR(255) | DEFAULT '' | ECPay hash IV for encryption |
| `overlay_settings` | JSONB | DEFAULT '{}' | OBS overlay display settings |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `app_data_pkey` - PRIMARY KEY on `id`

## Relationships

### 1. Reference Array Relationship
- **From:** `app_data.seen_trade_nos`
- **To:** `donations.trade_no`
- **Type:** 1:N (one app_data row references many donation trade_nos)
- **Description:** The `seen_trade_nos` array contains trade numbers from the donations table to prevent duplicate processing

### 2. Calculated Field Relationship
- **From:** `app_data.total`
- **To:** `donations.amount`
- **Type:** 1:N (one total aggregates many donation amounts)
- **Description:** The `total` field is the sum of all `amount` values in the donations table

## Data Flow

### Donation Processing Flow

1. **Webhook Reception** → ECPay sends payment notification to `/webhook/ecpay`
2. **Validation** → Server validates merchant ID and CheckMacValue signature
3. **Decryption** → Decrypt the Data field using AES-128-CBC
4. **Duplicate Check** → `addDonation()` checks if trade_no exists in `seen_trade_nos`
5. **Insert** → If not duplicate, insert new record into `donations` table
6. **Update Totals** → Update `app_data.total` and add trade_no to `seen_trade_nos`
7. **Broadcast** → Send SSE update to all connected clients (overlay, admin panel)

## Storage Modes

### Sandbox Mode
- **Trigger:** `ENVIRONMENT=sandbox`
- **Storage:** Uses `db.json` file
- **Use Case:** Local testing and development

### Development Mode
- **Trigger:** No `DATABASE_URL` set
- **Storage:** Uses `db.json` file
- **Use Case:** Local development without PostgreSQL

### Production Mode
- **Trigger:** `DATABASE_URL` is set AND `ENVIRONMENT=production`
- **Storage:** Uses PostgreSQL database
- **Use Case:** Production deployment (e.g., Render, Heroku)

## JSON File Structure

When using JSON file storage (`db.json`):

```json
{
  "goal": {
    "title": "斗內目標",
    "amount": 1000,
    "startFrom": 0
  },
  "total": 0,
  "donations": [
    {
      "tradeNo": "DONATE1234567890",
      "amount": 100,
      "payer": "王小明",
      "message": "加油！",
      "at": "2024-01-01T12:00:00.000Z"
    }
  ],
  "seenTradeNos": ["DONATE1234567890"],
  "ecpay": {
    "merchantId": "3002607",
    "hashKey": "pwFHCqoQZGmho4w6",
    "hashIV": "EkRm7iFT261dpevs"
  },
  "overlaySettings": {
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
    "alertSound": true
  }
}
```

## Migration

The database class automatically handles migration from JSON to PostgreSQL:

1. When PostgreSQL connection is established
2. If `ENVIRONMENT=sandbox` (migration enabled)
3. If PostgreSQL is empty or contains default data
4. Reads `db.json` and imports all data
5. Preserves all donations, settings, and configuration

## Usage Examples

### View Schema
```bash
# Show complete schema
node show-schema.js
```

### Programmatic Access
```javascript
import database from './database.js';

// Get schema object
const schema = await database.getDatabaseSchema();

// Access table definitions
console.log('Donations table columns:', schema.tables.donations.columns);
console.log('Relationships:', schema.relationships);

// Check storage mode
console.log('Storage mode:', schema.storageMode);
console.log('Connected:', schema.connected);

// Get data flow information
console.log('Donation process:', schema.dataFlow.donation_process);
```

### Query Actual PostgreSQL Schema
```javascript
// Only works if connected to PostgreSQL
const actualSchema = await database.getDatabaseSchema(true);
console.log('Actual database columns:', actualSchema.tables.donations.columns);
```

## Notes

- The `app_data` table always contains a single row with `id='main'`
- `seen_trade_nos` prevents duplicate donation processing (idempotency)
- Trade numbers are unique and generated as `DONATE{timestamp}`
- Donations are ordered by `created_at DESC` when retrieved
- PostgreSQL uses transactions for atomic donation processing
- JSON file mode is synchronous and simpler for development

## Quick Reference Scripts

```bash
# View database schema
node show-schema.js

# Test webhook with mock data
node test-webhook.js

# Simple webhook test (bypasses encryption)
node test-webhook-simple.js

# Check if server is running
node check-server.js
```
