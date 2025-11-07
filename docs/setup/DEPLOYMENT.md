# Production Deployment Guide

The issue you experienced where goal settings keep reverting to default values happens because cloud hosting platforms like Render have **ephemeral file systems**. When the server restarts, all changes to local files are lost.

## Solution: PostgreSQL Database on Render

This fix implements persistent cloud database storage using PostgreSQL directly on Render (free tier available).

## Setup Instructions

### 1. Create PostgreSQL Database on Render

1. Go to your [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" and select "PostgreSQL" 
3. Fill in the details:
   - **Name:** `donationbar-db` (or any name you prefer)
   - **Database:** `donationbar`
   - **User:** `donationbar_user` (or any username)
   - **Region:** Choose closest to your web service
   - **PostgreSQL Version:** 15 (latest)
   - **Plan:** Free (perfect for donation tracking)
4. Click "Create Database"
5. Wait for database creation (1-2 minutes)

### 2. Get Database Connection Details

1. After creation, go to your PostgreSQL service dashboard
2. In the "Connections" section, copy the **External Database URL**
3. It looks like: `postgres://username:password@dpg-xxxxx-a.oregon-postgres.render.com/database`

### 3. Connect Database to Your Web Service

1. Go to your **web service** (not the database) dashboard
2. Click "Environment" tab
3. Add new environment variable:
   - **Key:** `DATABASE_URL`
   - **Value:** The External Database URL you copied from step 2
4. Also make sure you have:
   - `ENVIRONMENT=production`
   - All other required variables from `.env.example`

### 4. Optional: Connect Database to Same Project

1. In your PostgreSQL dashboard, scroll down to "Connect"
2. Select your web service from the dropdown
3. This will automatically add `DATABASE_URL` to your web service

### 5. Deploy Updated Code

1. Install new dependency locally:
   ```bash
   npm install pg
   ```

2. Push changes to your repository:
   ```bash
   git add .
   git commit -m "Add PostgreSQL persistence to fix goal reset issue"
   git push
   ```

3. Render will automatically redeploy

## How It Works

### Development (Local)
- Uses `db.json` file for easy development
- No database setup needed

### Production (Render)
- Automatically detects production environment
- Uses PostgreSQL for persistent storage
- Creates tables automatically on first run
- Migrates existing data from `db.json` if present
- Goal settings persist across server restarts

## Migration

The system automatically migrates your existing data:
- ✅ Current goal settings
- ✅ All donations history  
- ✅ ECPay credentials
- ✅ Overlay settings
- ✅ Seen trade numbers (prevents duplicates)

## Verification

After deployment:
1. Check logs for "🐘 Connected to PostgreSQL"
2. Check logs for "📊 PostgreSQL tables initialized"
3. Test changing goal settings in admin panel
4. Wait 10-15 minutes or force a restart
5. Verify settings are still preserved

## Troubleshooting

### Connection Issues
- Verify DATABASE_URL is correct and matches the External Database URL from Render
- Check that PostgreSQL service is running on Render
- Ensure web service and database are in the same region for better performance

### Fallback Behavior
- If PostgreSQL connection fails, app automatically falls back to JSON file
- Logs will show "📝 Falling back to JSON file storage"

### Environment Detection
- Production mode: `ENVIRONMENT=production` OR `DATABASE_URL` present
- Development mode: Neither condition met

## Cost

- **Render PostgreSQL (Free Tier):**
  - 1 GB storage
  - Shared CPU
  - No credit card required
  - Perfect for donation tracking
  - Automatic backups
  - 90-day data retention

## Support

If you encounter issues:
1. Check Render logs for database connection status
2. Verify all environment variables are set correctly
3. Ensure PostgreSQL service is running in your Render dashboard
4. Test locally with `DATABASE_URL` set to ensure compatibility
