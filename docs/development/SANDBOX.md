# Sandbox Mode Guide

## Overview
Sandbox mode allows you to test the application locally using a `db.json` file instead of connecting to the production PostgreSQL database, even if `DATABASE_URL` is set in your environment.

## How to Enable Sandbox Mode

Set the environment variable:
```bash
ENVIRONMENT=sandbox
```

## Behavior in Different Modes

### Sandbox Mode (`ENVIRONMENT=sandbox`)
- ✅ Always uses local `db.json` file
- ✅ Ignores `DATABASE_URL` even if set
- ✅ Creates `db.json` automatically if it doesn't exist
- ✅ Safe for local testing without affecting production data
- ✅ Migration from db.json is enabled (can be triggered)

### Production Mode (`ENVIRONMENT=production` or `DATABASE_URL` set)
- 🐘 Uses PostgreSQL database
- 🔒 Requires `DATABASE_URL` environment variable
- 📊 Creates tables automatically on first run
- 🚫 Migration from db.json is disabled (unless `ENVIRONMENT=sandbox`)

### Development Mode (no environment variables)
- 📝 Uses local `db.json` file by default
- 💾 Creates `db.json` automatically if it doesn't exist

## Testing Locally with Sandbox Mode

1. **Create/update `.env` file:**
   ```env
   ENVIRONMENT=sandbox
   PORT=3000
   ADMIN_PASSWORD=your_password
   SESSION_SECRET=your_secret
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Check the console for confirmation:**
   ```
   🧪 Sandbox mode: Using local db.json file
   📝 db.json not found, creating with default data...
   💾 Data saved to local db.json
   ```

## Database Operations in Sandbox Mode

All database operations use `db.json`:
- ✅ `readDB()` - Reads from db.json
- ✅ `writeDB()` - Writes to db.json
- ✅ `addDonation()` - Adds to db.json
- ✅ Admin panel updates - All saved to db.json

## File Location
- **Path:** `db.json` in project root
- **Git:** Already ignored in `.gitignore`
- **Auto-created:** Yes, with default data

## Migration Testing

To test migration from db.json to PostgreSQL:
1. Set `ENVIRONMENT=sandbox`
2. Add test data via the app
3. Change to `ENVIRONMENT=production` + add `DATABASE_URL`
4. Migration will automatically copy data from db.json to PostgreSQL

## Troubleshooting

**Q: I have `DATABASE_URL` set but want to use local file**
A: Set `ENVIRONMENT=sandbox` - this takes priority over `DATABASE_URL`

**Q: db.json is not being created**
A: Check file permissions in the project directory

**Q: Changes not persisting**
A: Check console logs for "💾 Data saved to local db.json" messages

## Console Log Reference

| Message | Meaning |
|---------|---------|
| `🧪 Sandbox mode: Using local db.json file` | Sandbox mode active |
| `📝 db.json not found, creating with default data...` | Creating new db.json |
| `💾 Data saved to local db.json` | Write successful |
| `🐘 Connected to PostgreSQL` | Using production database |
