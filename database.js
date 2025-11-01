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
        
        // Reset app_data (including goal_start_from)
        await pgClient.query(
          'UPDATE app_data SET total = 0, goal_start_from = 0, seen_trade_nos = $1, updated_at = NOW() WHERE id = $2',
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

  /**
   * Get database schema and relationships information
   * @param {boolean} queryActual - If true, queries actual PostgreSQL schema (only works if connected)
   * @returns {Object} Schema information including tables, columns, relationships
   */
  async getDatabaseSchema(queryActual = false) {
    const schema = {
      storageMode: this.isProduction && this.connected ? 'PostgreSQL' : 'JSON File',
      connected: this.connected,
      tables: {},
      relationships: [],
      jsonStructure: null
    };

    // If using PostgreSQL and queryActual is true, get actual schema from database
    if (this.isProduction && this.connected && queryActual) {
      try {
        // Query actual donations table schema
        const donationsSchema = await pgClient.query(`
          SELECT 
            column_name,
            data_type,
            character_maximum_length,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_name = 'donations'
          ORDER BY ordinal_position
        `);

        // Query actual app_data table schema
        const appDataSchema = await pgClient.query(`
          SELECT 
            column_name,
            data_type,
            character_maximum_length,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_name = 'app_data'
          ORDER BY ordinal_position
        `);

        // Query indexes and constraints
        const donationsIndexes = await pgClient.query(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE tablename = 'donations'
        `);

        const appDataIndexes = await pgClient.query(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE tablename = 'app_data'
        `);

        schema.tables.donations = {
          columns: donationsSchema.rows.map(col => ({
            name: col.column_name,
            type: col.data_type,
            maxLength: col.character_maximum_length,
            nullable: col.is_nullable === 'YES',
            default: col.column_default
          })),
          indexes: donationsIndexes.rows.map(idx => ({
            name: idx.indexname,
            definition: idx.indexdef
          })),
          description: 'Stores individual donation records'
        };

        schema.tables.app_data = {
          columns: appDataSchema.rows.map(col => ({
            name: col.column_name,
            type: col.data_type,
            maxLength: col.character_maximum_length,
            nullable: col.is_nullable === 'YES',
            default: col.column_default
          })),
          indexes: appDataIndexes.rows.map(idx => ({
            name: idx.indexname,
            definition: idx.indexdef
          })),
          description: 'Stores application configuration and settings'
        };

      } catch (error) {
        console.error('Error querying actual schema:', error);
        // Fall back to defined schema
        queryActual = false;
      }
    }

    // If not querying actual or if it failed, return the defined schema
    if (!queryActual) {
      schema.tables.donations = {
        columns: [
          { name: 'id', type: 'SERIAL', constraint: 'PRIMARY KEY', description: 'Auto-incrementing donation ID' },
          { name: 'trade_no', type: 'VARCHAR(50)', constraint: 'UNIQUE NOT NULL', description: 'Unique trade number from ECPay' },
          { name: 'amount', type: 'INTEGER', constraint: 'NOT NULL', description: 'Donation amount in TWD' },
          { name: 'payer', type: 'VARCHAR(255)', default: 'Anonymous', description: 'Name of the donor' },
          { name: 'message', type: 'TEXT', default: '', description: 'Message from the donor' },
          { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()', description: 'When the donation was created' }
        ],
        indexes: [
          { name: 'donations_pkey', type: 'PRIMARY KEY', column: 'id' },
          { name: 'donations_trade_no_key', type: 'UNIQUE', column: 'trade_no' }
        ],
        description: 'Stores individual donation records from ECPay'
      };

      schema.tables.app_data = {
        columns: [
          { name: 'id', type: 'VARCHAR(20)', constraint: 'PRIMARY KEY', default: 'main', description: 'Single row identifier' },
          { name: 'goal_title', type: 'VARCHAR(255)', default: '斗內目標', description: 'Title of the donation goal' },
          { name: 'goal_amount', type: 'INTEGER', default: '1000', description: 'Target donation amount' },
          { name: 'goal_start_from', type: 'INTEGER', default: '0', description: 'Starting amount for the progress bar' },
          { name: 'total', type: 'INTEGER', default: '0', description: 'Total donations received' },
          { name: 'seen_trade_nos', type: 'TEXT[]', default: '{}', description: 'Array of processed trade numbers (for deduplication)' },
          { name: 'ecpay_merchant_id', type: 'VARCHAR(255)', default: '', description: 'ECPay merchant ID' },
          { name: 'ecpay_hash_key', type: 'VARCHAR(255)', default: '', description: 'ECPay hash key for encryption' },
          { name: 'ecpay_hash_iv', type: 'VARCHAR(255)', default: '', description: 'ECPay hash IV for encryption' },
          { name: 'overlay_settings', type: 'JSONB', default: '{}', description: 'OBS overlay display settings' },
          { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()', description: 'Last update timestamp' }
        ],
        indexes: [
          { name: 'app_data_pkey', type: 'PRIMARY KEY', column: 'id' }
        ],
        description: 'Stores application configuration (single row table)'
      };
    }

    // Define relationships
    schema.relationships = [
      {
        type: 'Reference Array',
        from: { table: 'app_data', column: 'seen_trade_nos' },
        to: { table: 'donations', column: 'trade_no' },
        description: 'app_data.seen_trade_nos contains an array of trade_no values from donations table to prevent duplicate processing',
        cardinality: '1:N (one app_data row references many donation trade_nos)'
      },
      {
        type: 'Calculated Field',
        from: { table: 'app_data', column: 'total' },
        to: { table: 'donations', column: 'amount' },
        description: 'app_data.total is the sum of all donations.amount values',
        cardinality: '1:N (one total aggregates many donation amounts)'
      }
    ];

    // JSON file structure (when not using PostgreSQL)
    schema.jsonStructure = {
      file: 'db.json',
      structure: {
        goal: {
          title: 'string - Donation goal title',
          amount: 'number - Target amount',
          startFrom: 'number - Starting amount for progress'
        },
        total: 'number - Total donations received',
        donations: [
          {
            tradeNo: 'string - Unique trade number',
            amount: 'number - Donation amount',
            payer: 'string - Donor name',
            message: 'string - Donor message',
            at: 'string (ISO date) - Timestamp'
          }
        ],
        seenTradeNos: ['array of strings - Processed trade numbers'],
        ecpay: {
          merchantId: 'string - ECPay merchant ID',
          hashKey: 'string - ECPay hash key',
          hashIV: 'string - ECPay hash IV'
        },
        overlaySettings: {
          showDonationAlert: 'boolean',
          fontSize: 'number',
          fontColor: 'string (hex color)',
          backgroundColor: 'string (hex color)',
          progressBarColor: 'string (hex color)',
          progressBarHeight: 'number',
          progressBarCornerRadius: 'number',
          alertDuration: 'number (milliseconds)',
          position: 'string (position name)',
          width: 'number',
          alertEnabled: 'boolean',
          alertSound: 'boolean'
        }
      },
      description: 'Used when ENVIRONMENT !== production or DATABASE_URL is not set'
    };

    // Data flow notes
    schema.dataFlow = {
      donation_process: [
        '1. ECPay sends webhook → /webhook/ecpay endpoint',
        '2. Server validates and decrypts payment data',
        '3. addDonation() checks for duplicate trade_no in seen_trade_nos',
        '4. If not duplicate: Insert into donations table',
        '5. Update app_data.total and add trade_no to seen_trade_nos',
        '6. Broadcast update via SSE to connected clients'
      ],
      storage_modes: {
        sandbox: 'Uses db.json file (ENVIRONMENT=sandbox)',
        development: 'Uses db.json file (no DATABASE_URL)',
        production: 'Uses PostgreSQL (DATABASE_URL is set and ENVIRONMENT=production)'
      }
    };

    return schema;
  }

  /**
   * Print database schema in a human-readable format
   * @param {boolean} queryActual - Query actual schema from database
   */
  async printDatabaseSchema(queryActual = false) {
    const schema = await this.getDatabaseSchema(queryActual);
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              DATABASE SCHEMA & RELATIONSHIPS                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log(`📊 Storage Mode: ${schema.storageMode}`);
    console.log(`🔌 Connected: ${schema.connected ? 'Yes' : 'No'}\n`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Print each table
    for (const [tableName, tableInfo] of Object.entries(schema.tables)) {
      console.log(`📋 TABLE: ${tableName}`);
      console.log(`   Description: ${tableInfo.description}\n`);
      
      console.log('   Columns:');
      tableInfo.columns.forEach(col => {
        const constraint = col.constraint ? ` [${col.constraint}]` : '';
        const defaultVal = col.default ? ` DEFAULT ${col.default}` : '';
        const desc = col.description ? ` - ${col.description}` : '';
        console.log(`   • ${col.name}: ${col.type}${constraint}${defaultVal}${desc}`);
      });
      
      if (tableInfo.indexes && tableInfo.indexes.length > 0) {
        console.log('\n   Indexes:');
        tableInfo.indexes.forEach(idx => {
          console.log(`   • ${idx.name}${idx.type ? ` (${idx.type})` : ''}`);
        });
      }
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
    
    // Print relationships
    console.log('🔗 RELATIONSHIPS:\n');
    schema.relationships.forEach((rel, idx) => {
      console.log(`${idx + 1}. ${rel.type}`);
      console.log(`   ${rel.from.table}.${rel.from.column} → ${rel.to.table}.${rel.to.column}`);
      console.log(`   ${rel.description}`);
      console.log(`   Cardinality: ${rel.cardinality}\n`);
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Print data flow
    console.log('🔄 DATA FLOW:\n');
    console.log('Donation Process:');
    schema.dataFlow.donation_process.forEach(step => {
      console.log(`   ${step}`);
    });
    
    console.log('\nStorage Modes:');
    Object.entries(schema.dataFlow.storage_modes).forEach(([mode, desc]) => {
      console.log(`   • ${mode}: ${desc}`);
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Print JSON structure
    if (schema.jsonStructure) {
      console.log('📄 JSON FILE STRUCTURE (db.json):\n');
      console.log(`   File: ${schema.jsonStructure.file}`);
      console.log(`   ${schema.jsonStructure.description}\n`);
      console.log('   ' + JSON.stringify(schema.jsonStructure.structure, null, 2).replace(/\n/g, '\n   '));
      console.log('\n');
    }
    
    return schema;
  }
}

export default new Database();
