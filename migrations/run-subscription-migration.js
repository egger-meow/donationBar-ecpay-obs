#!/usr/bin/env node
/**
 * Run Subscription System Migration
 * Applies add-subscription-payment-system.sql
 */

import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;
const __dirname = path.resolve();

console.log('🔄 Running Subscription System Migration\n');

const isSandbox = process.env.ENVIRONMENT === 'sandbox';
const databaseUrl = process.env.DATABASE_URL;

if (isSandbox) {
  console.log('✅ Sandbox mode detected');
  console.log('   Subscription fields will be available in db.json automatically');
  console.log('   No migration needed for JSON file storage\n');
  console.log('💡 To test with PostgreSQL, set DATABASE_URL in .env');
  process.exit(0);
}

if (!databaseUrl) {
  console.log('⚠️  No DATABASE_URL found');
  console.log('   Options:');
  console.log('   1. Set DATABASE_URL in .env for PostgreSQL');
  console.log('   2. Set ENVIRONMENT=sandbox for JSON file storage');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Read migration SQL
    const sqlPath = path.join(__dirname, 'add-subscription-payment-system.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error('Migration file not found: ' + sqlPath);
    }

    const sql = fs.readFileSync(sqlPath, 'utf-8');
    console.log('📄 Loaded migration file');
    console.log('   File:', sqlPath);
    console.log('   Size:', (sql.length / 1024).toFixed(2), 'KB\n');

    // Check if already migrated
    const check = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' 
      AND column_name = 'ecpay_merchant_trade_no'
    `);

    if (check.rows.length > 0) {
      console.log('⚠️  Migration already applied');
      console.log('   Column ecpay_merchant_trade_no already exists');
      console.log('   Skipping migration\n');
      
      // Check payment_history table
      const historyCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'payment_history'
        )
      `);
      
      if (historyCheck.rows[0].exists) {
        console.log('✅ payment_history table exists');
        
        // Show table stats
        const stats = await client.query(`
          SELECT COUNT(*) as count FROM payment_history
        `);
        console.log(`   Records: ${stats.rows[0].count}`);
      }
      
      await client.end();
      return;
    }

    console.log('🚀 Running migration...\n');

    // Execute migration
    await client.query(sql);

    console.log('✅ Migration completed successfully!\n');

    // Verify tables
    console.log('📊 Verifying migration:');
    
    const subCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' 
      AND column_name IN (
        'ecpay_merchant_trade_no',
        'ecpay_trade_no',
        'last_payment_date',
        'last_payment_status',
        'failed_payment_count',
        'grace_period_end_at'
      )
      ORDER BY column_name
    `);

    console.log('\n✅ Subscriptions table columns added:');
    subCols.rows.forEach(row => {
      console.log(`   - ${row.column_name}`);
    });

    const historyExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'payment_history'
      )
    `);

    if (historyExists.rows[0].exists) {
      console.log('\n✅ payment_history table created');
      
      const historyColumns = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.columns 
        WHERE table_name = 'payment_history'
      `);
      console.log(`   Columns: ${historyColumns.rows[0].count}`);
    }

    const viewExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.views 
        WHERE table_name = 'subscription_overview'
      )
    `);

    if (viewExists.rows[0].exists) {
      console.log('\n✅ subscription_overview view created');
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Migration complete!');
    console.log('='.repeat(50));
    console.log('\n📝 Next steps:');
    console.log('1. Restart your server');
    console.log('2. Test subscription endpoints');
    console.log('3. Setup ECPay test credentials');
    console.log('4. Review SUBSCRIPTION_IMPLEMENTATION.md');
    console.log('\n💡 Test with: node test-subscription.js\n');

    await client.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    await client.end();
    process.exit(1);
  }
}

runMigration();
