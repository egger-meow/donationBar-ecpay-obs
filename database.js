import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

const __dirname = path.resolve();
const DB_PATH = path.join(__dirname, 'db.json');

// PostgreSQL connection
let pgClient = null;

class Database {
  constructor() {
    // Always use local db.json in sandbox mode, even if DATABASE_URL exists
    const isSandbox = process.env.ENVIRONMENT === 'sandbox';
    this.isProduction = !isSandbox && (process.env.ENVIRONMENT === 'production' || process.env.DATABASE_URL);
    this.connected = false;
    
    if (isSandbox) {
      console.log('🧪 Sandbox mode: Using local db.json file');
    }
    
    if (this.isProduction) {
      this.initPostgreSQL();
    }
  }

  async initPostgreSQL() {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        console.log('📝 No DATABASE_URL found, falling back to JSON file');
        this.isProduction = false;
        return;
      }

      pgClient = new Client({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      await pgClient.connect();
      this.connected = true;
      console.log('🐘 Connected to PostgreSQL');

      // Create tables if they don't exist
      await this.createTables();
      
      // Migrate data from JSON file if it exists and database is empty
      await this.migrateFromJSON();
      
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      console.log('📝 Falling back to JSON file storage');
      this.isProduction = false;
      this.connected = false;
    }
  }

  async createTables() {
    try {
      // Create donations table
      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS donations (
          id SERIAL PRIMARY KEY,
          trade_no VARCHAR(50) UNIQUE NOT NULL,
          amount INTEGER NOT NULL,
          payer VARCHAR(255) DEFAULT 'Anonymous',
          message TEXT DEFAULT '',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create app_data table for storing configuration
      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS app_data (
          id VARCHAR(20) PRIMARY KEY DEFAULT 'main',
          goal_title VARCHAR(255) DEFAULT '斗內目標',
          goal_amount INTEGER DEFAULT 1000,
          goal_start_from INTEGER DEFAULT 0,
          total INTEGER DEFAULT 0,
          seen_trade_nos TEXT[] DEFAULT '{}',
          ecpay_merchant_id VARCHAR(255) DEFAULT '',
          ecpay_hash_key VARCHAR(255) DEFAULT '',
          ecpay_hash_iv VARCHAR(255) DEFAULT '',
          overlay_settings JSONB DEFAULT '{}',
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Add goal_start_from column if it doesn't exist (for existing databases)
      await pgClient.query(`
        ALTER TABLE app_data 
        ADD COLUMN IF NOT EXISTS goal_start_from INTEGER DEFAULT 0
      `);

      // Add message column to donations table if it doesn't exist (for existing databases)
      await pgClient.query(`
        ALTER TABLE donations 
        ADD COLUMN IF NOT EXISTS message TEXT DEFAULT ''
      `);

      // Insert default record if not exists
      await pgClient.query(`
        INSERT INTO app_data (id) VALUES ('main')
        ON CONFLICT (id) DO NOTHING
      `);

      console.log('📊 PostgreSQL tables initialized');
    } catch (error) {
      console.error('Error creating tables:', error);
      throw error;
    }
  }

  async migrateFromJSON() {
    try {
      // Only migrate if SANDMODE is enabled
      if (process.env.ENVIRONMENT !== 'sandbox') {
        console.log('📊 Migration skipped: ENVIRONMENT is not sandbox');
        return;
      }

      // Check if we already have data in PostgreSQL
      const existingData = await pgClient.query('SELECT * FROM app_data WHERE id = $1', ['main']);
      if (existingData.rows[0] && existingData.rows[0].goal_title !== '斗內目標') {
        console.log('📊 PostgreSQL already contains migrated data, skipping migration');
        return;
      }

      // Check if JSON file exists
      if (!fs.existsSync(DB_PATH)) {
        console.log('📊 No JSON file to migrate');
        return;
      }

      // Read JSON file
      const jsonData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      console.log('🔄 Migrating data from JSON file to PostgreSQL...');

      // Update app data
      await pgClient.query(`
        UPDATE app_data SET 
          goal_title = $1,
          goal_amount = $2,
          goal_start_from = $3,
          total = $4,
          seen_trade_nos = $5,
          ecpay_merchant_id = $6,
          ecpay_hash_key = $7,
          ecpay_hash_iv = $8,
          overlay_settings = $9,
          updated_at = NOW()
        WHERE id = 'main'
      `, [
        jsonData.goal?.title || '斗內目標',
        jsonData.goal?.amount || 1000,
        jsonData.goal?.startFrom || 0,
        jsonData.total || 0,
        jsonData.seenTradeNos || [],
        jsonData.ecpay?.merchantId || '',
        jsonData.ecpay?.hashKey || '',
        jsonData.ecpay?.hashIV || '',
        JSON.stringify(jsonData.overlaySettings || {})
      ]);

      // Migrate donations
      if (jsonData.donations && jsonData.donations.length > 0) {
        for (const donation of jsonData.donations) {
          try {
            await pgClient.query(`
              INSERT INTO donations (trade_no, amount, payer, message, created_at)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (trade_no) DO NOTHING
            `, [
              donation.tradeNo,
              donation.amount,
              donation.payer || 'Anonymous',
              donation.message || '',
              new Date(donation.at)
            ]);
          } catch (err) {
            console.error('Error migrating donation:', err);
          }
        }
      }

      console.log('✅ Migration completed successfully');
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
    }
  }

  // Read database
  async readDB() {
    if (this.isProduction && this.connected) {
      try {
        // Get app data
        const appDataResult = await pgClient.query('SELECT * FROM app_data WHERE id = $1', ['main']);
        const appData = appDataResult.rows[0] || {};

        // Get donations
        const donationsResult = await pgClient.query(
          'SELECT trade_no, amount, payer, message, created_at FROM donations ORDER BY created_at DESC LIMIT 100'
        );
        
        return {
          goal: {
            title: appData.goal_title || '斗內目標',
            amount: appData.goal_amount || 1000,
            startFrom: appData.goal_start_from || 0
          },
          total: appData.total || 0,
          donations: donationsResult.rows.map(d => ({
            tradeNo: d.trade_no,
            amount: d.amount,
            payer: d.payer,
            message: d.message || '',
            at: d.created_at.toISOString()
          })),
          seenTradeNos: appData.seen_trade_nos || [],
          ecpay: {
            merchantId: appData.ecpay_merchant_id || '',
            hashKey: appData.ecpay_hash_key || '',
            hashIV: appData.ecpay_hash_iv || ''
          },
          overlaySettings: appData.overlay_settings || {}
        };
      } catch (error) {
        console.error('PostgreSQL read error:', error);
        return this.getDefaultData();
      }
    } else {
      // Use JSON file
      try {
        if (!fs.existsSync(DB_PATH)) {
          console.log('📝 db.json not found, creating with default data...');
          const defaultData = this.getDefaultData();
          fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2));
          return defaultData;
        }
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      } catch (error) {
        console.error('Error reading JSON database:', error);
        return this.getDefaultData();
      }
    }
  }

  // Write database
  async writeDB(data) {
    if (this.isProduction && this.connected) {
      try {
        await pgClient.query(`
          UPDATE app_data SET 
            goal_title = $1,
            goal_amount = $2,
            goal_start_from = $3,
            total = $4,
            seen_trade_nos = $5,
            ecpay_merchant_id = $6,
            ecpay_hash_key = $7,
            ecpay_hash_iv = $8,
            overlay_settings = $9,
            updated_at = NOW()
          WHERE id = 'main'
        `, [
          data.goal?.title || '斗內目標',
          data.goal?.amount || 1000,
          data.goal?.startFrom || 0,
          data.total || 0,
          data.seenTradeNos || [],
          data.ecpay?.merchantId || '',
          data.ecpay?.hashKey || '',
          data.ecpay?.hashIV || '',
          JSON.stringify(data.overlaySettings || {})
        ]);

        console.log('💾 Data saved to PostgreSQL');
      } catch (error) {
        console.error('PostgreSQL write error:', error);
        throw error;
      }
    } else {
      // Use JSON file
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
      console.log('💾 Data saved to local db.json');
    }
  }

  // Add donation
  async addDonation({ tradeNo, amount, payer, message }) {
    if (this.isProduction && this.connected) {
      try {
        // Begin transaction
        await pgClient.query('BEGIN');

        // Check for duplicate
        const existingDonation = await pgClient.query(
          'SELECT trade_no FROM donations WHERE trade_no = $1',
          [tradeNo]
        );
        
        if (existingDonation.rows.length > 0) {
          await pgClient.query('ROLLBACK');
          console.log(`Duplicate trade number: ${tradeNo}`);
          return false;
        }

        // Insert donation
        await pgClient.query(
          'INSERT INTO donations (trade_no, amount, payer, message) VALUES ($1, $2, $3, $4)',
          [tradeNo, Number(amount), payer || 'Anonymous', message || '']
        );

        // Update app data
        const appDataResult = await pgClient.query('SELECT * FROM app_data WHERE id = $1', ['main']);
        const currentData = appDataResult.rows[0] || {};
        
        const newSeenTradeNos = [...(currentData.seen_trade_nos || []), tradeNo];
        const newTotal = (currentData.total || 0) + Number(amount);

        await pgClient.query(
          'UPDATE app_data SET seen_trade_nos = $1, total = $2, updated_at = NOW() WHERE id = $3',
          [newSeenTradeNos, newTotal, 'main']
        );

        await pgClient.query('COMMIT');
        console.log(`New donation: ${payer} donated NT$${amount}`);
        return true;

      } catch (error) {
        await pgClient.query('ROLLBACK');
        if (error.code === '23505') { // Unique violation
          console.log(`Duplicate trade number: ${tradeNo}`);
          return false;
        }
        console.error('PostgreSQL donation error:', error);
        throw error;
      }
    } else {
      // Use JSON file method
      const data = await this.readDB();
      
      if (data.seenTradeNos.includes(tradeNo)) {
        console.log(`Duplicate trade number: ${tradeNo}`);
        return false;
      }
      
      data.seenTradeNos.push(tradeNo);
      data.total = (data.total || 0) + Number(amount);
      data.donations.push({
        tradeNo,
        amount: Number(amount),
        payer: payer || 'Anonymous',
        message: message || '',
        at: new Date().toISOString()
      });
      
      await this.writeDB(data);
      console.log(`New donation: ${payer} donated NT$${amount}`);
      return true;
    }
  }

  // Clear all donations and reset totals
  async clearAllDonations() {
    if (this.isProduction && this.connected) {
      try {
        await pgClient.query('BEGIN');
        
        // Clear donations table
        await pgClient.query('DELETE FROM donations');
        
        // Reset app_data
        await pgClient.query(
          'UPDATE app_data SET total = 0, seen_trade_nos = $1, updated_at = NOW() WHERE id = $2',
          [[], 'main']
        );
        
        await pgClient.query('COMMIT');
        console.log('✨ All donations cleared from database');
        return true;
      } catch (error) {
        await pgClient.query('ROLLBACK');
        console.error('Error clearing donations:', error);
        throw error;
      }
    } else {
      // Use JSON file method
      const data = this.getDefaultData();
      await this.writeDB(data);
      console.log('✨ All donations cleared from local db.json');
      return true;
    }
  }

  getDefaultData() {
    return {
      goal: { title: "斗內目標", amount: 1000, startFrom: 0 },
      total: 0,
      donations: [],
      seenTradeNos: [],
      ecpay: { merchantId: "", hashKey: "", hashIV: "" },
      overlaySettings: {
        showDonationAlert: true,
        fontSize: 10,
        fontColor: "#369bce",
        backgroundColor: "#1a1a1a",
        progressBarColor: "#46e65a",
        progressBarHeight: 30,
        progressBarCornerRadius: 15,
        alertDuration: 5000,
        position: "top-center",
        width: 900,
        alertEnabled: true,
        alertSound: true,
        donationDisplayMode: "top", // "top" | "latest" | "hidden"
        donationDisplayCount: 3 // Number of donations to display
      }
    };
  }
}

export default new Database();
