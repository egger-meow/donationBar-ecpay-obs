# Database Schema Quick Reference

## 🎯 Quick Access Methods

### Method 1: Command Line (Formatted Output)
```bash
node show-schema.js
```
Shows beautifully formatted schema with tables, relationships, and data flow.

### Method 2: HTTP API (JSON Output)
```bash
# Start server
npm start

# View schema in browser or curl
http://localhost:3000/api/schema

# Query actual PostgreSQL schema (if connected)
http://localhost:3000/api/schema?actual=true
```

### Method 3: Programmatic Access
```javascript
import database from './database.js';

// Get schema object
const schema = await database.getDatabaseSchema();

// Print formatted output
await database.printDatabaseSchema();

// Query actual DB schema (PostgreSQL only)
const actualSchema = await database.getDatabaseSchema(true);
```

## 📊 Database Structure

### Two Storage Modes

**JSON File Mode** (db.json)
- Used in: Sandbox and Development
- Location: `e:\IDEA\donationBar-ecpay-obs\db.json`
- Structure: Single JSON object with all data

**PostgreSQL Mode**
- Used in: Production (when DATABASE_URL is set)
- Tables: `donations`, `app_data`
- Features: ACID transactions, indexes, constraints

## 📋 Table Overview

### donations
```
id (PK) | trade_no (UNIQUE) | amount | payer | message | created_at
----------------------------------------------------------------------
1       | DONATE1234567     | 100    | 王小明 | 加油！   | 2024-01-01...
2       | DONATE1234568     | 500    | 李小華 | 感謝     | 2024-01-02...
```

### app_data (Single Row)
```
id='main' | goal_title | goal_amount | total | seen_trade_nos[] | ecpay | overlay_settings
```

## 🔗 Key Relationships

1. **Deduplication**: `app_data.seen_trade_nos[]` ↔ `donations.trade_no`
   - Prevents duplicate donations from being processed

2. **Total Calculation**: `app_data.total` = SUM(`donations.amount`)
   - Maintains running total of all donations

## 🔄 Data Flow

```
ECPay Webhook
    ↓
/webhook/ecpay endpoint
    ↓
Validate & Decrypt
    ↓
Check trade_no in seen_trade_nos
    ↓
Insert into donations (if new)
    ↓
Update total & seen_trade_nos
    ↓
Broadcast via SSE → Overlay & Admin Panel
```

## 🛠️ New Functions Added

### `database.getDatabaseSchema(queryActual)`
Returns complete schema object with:
- Table definitions
- Column types and constraints
- Indexes
- Relationships
- Data flow information

### `database.printDatabaseSchema(queryActual)`
Prints formatted schema to console with:
- Visual table layouts
- Relationship diagrams
- Data flow charts
- Storage mode information

## 📝 Example Usage

### Get Schema Information
```javascript
const schema = await database.getDatabaseSchema();

console.log('Storage Mode:', schema.storageMode);
console.log('Tables:', Object.keys(schema.tables));
console.log('Donations columns:', schema.tables.donations.columns);
console.log('Relationships:', schema.relationships);
```

### View Schema in Browser
```bash
# Start server
npm start

# Open in browser
http://localhost:3000/api/schema
```

### Export Schema to File
```bash
# Export as JSON
node -e "import('./database.js').then(db => db.default.getDatabaseSchema().then(s => console.log(JSON.stringify(s, null, 2))))" > schema.json

# View formatted
node show-schema.js > schema.txt
```

## 💡 Use Cases

### For Development
- Understand database structure
- Plan new features
- Debug data issues
- Document the system

### For Production
- Verify database migrations
- Check actual schema vs expected
- Generate API documentation
- Troubleshoot data flow issues

### For New Team Members
- Quick onboarding reference
- Understand relationships
- Learn data flow
- See storage modes

## 🎨 Schema Output Example

```
╔════════════════════════════════════════════════════════════════╗
║              DATABASE SCHEMA & RELATIONSHIPS                   ║
╚════════════════════════════════════════════════════════════════╝

📊 Storage Mode: JSON File
🔌 Connected: No

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 TABLE: donations
   Description: Stores individual donation records from ECPay

   Columns:
   • id: SERIAL [PRIMARY KEY] - Auto-incrementing donation ID
   • trade_no: VARCHAR(50) [UNIQUE NOT NULL] - Unique trade number
   • amount: INTEGER [NOT NULL] - Donation amount in TWD
   • payer: VARCHAR(255) DEFAULT Anonymous - Name of the donor
   • message: TEXT - Message from the donor
   • created_at: TIMESTAMP WITH TIME ZONE - When donation was created

🔗 RELATIONSHIPS:

1. Reference Array
   app_data.seen_trade_nos → donations.trade_no
   Prevents duplicate donation processing
   Cardinality: 1:N
```

## 📚 Documentation Files

- `DATABASE-SCHEMA.md` - Complete schema documentation
- `SCHEMA-GUIDE.md` - This quick reference
- `show-schema.js` - Schema viewer script
- `database.js` - Database class with schema functions

## 🚀 Quick Commands

```bash
# View schema
node show-schema.js

# View via API
curl http://localhost:3000/api/schema | jq

# Export to file
node show-schema.js > database-schema.txt
```

---

**Created on branch:** `multiuser`  
**New functions:** `getDatabaseSchema()`, `printDatabaseSchema()`  
**New endpoint:** `GET /api/schema`
