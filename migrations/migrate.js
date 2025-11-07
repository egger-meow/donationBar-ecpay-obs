import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const { Client } = pg;
const __dirname = path.resolve();

console.log('🔄 Starting migration to multi-user schema...\n');

const isSandbox = process.env.ENVIRONMENT === 'sandbox';
const databaseUrl = process.env.DATABASE_URL;

if (!isSandbox && !databaseUrl) {
  console.log('⚠️  No DATABASE_URL found. For sandbox mode, set ENVIRONMENT=sandbox');
  process.exit(1);
}

// =============================================
// MIGRATION FOR POSTGRESQL
// =============================================
async function migratePostgreSQL() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    await client.query('BEGIN');

    // Step 1: Check if migration already done
    const checkUsers = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      )
    `);

    if (checkUsers.rows[0].exists) {
      console.log('⚠️  Migration tables already exist. Skipping...');
      await client.query('ROLLBACK');
      await client.end();
      return;
    }

    console.log('📋 Creating new tables...\n');

    // ==================== TABLE: users ====================
    await client.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        display_name VARCHAR(255),
        avatar_url TEXT,
        
        auth_provider VARCHAR(20) DEFAULT 'local',
        oauth_provider_id VARCHAR(255),
        oauth_access_token TEXT,
        oauth_refresh_token TEXT,
        oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
        
        email_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        is_admin BOOLEAN DEFAULT FALSE,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        CONSTRAINT check_auth CHECK (
          (auth_provider = 'local' AND password_hash IS NOT NULL) OR
          (auth_provider != 'local' AND oauth_provider_id IS NOT NULL)
        )
      )
    `);

    await client.query(`
      CREATE INDEX idx_users_email ON users(email)
    `);
    await client.query(`
      CREATE INDEX idx_users_oauth_provider ON users(auth_provider, oauth_provider_id)
    `);

    console.log('✅ Created table: users');

    // ==================== TABLE: subscriptions ====================
    await client.query(`
      CREATE TABLE subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        plan_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        
        price_per_month INTEGER DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'TWD',
        payment_provider VARCHAR(50),
        payment_provider_subscription_id VARCHAR(255),
        
        is_trial BOOLEAN DEFAULT FALSE,
        trial_start_date TIMESTAMP WITH TIME ZONE,
        trial_end_date TIMESTAMP WITH TIME ZONE,
        
        current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        current_period_end TIMESTAMP WITH TIME ZONE,
        canceled_at TIMESTAMP WITH TIME ZONE,
        
        max_donations_per_month INTEGER,
        max_api_calls_per_day INTEGER,
        features JSONB DEFAULT '{}',
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(user_id)
      )
    `);

    await client.query(`
      CREATE INDEX idx_subscriptions_user ON subscriptions(user_id)
    `);
    await client.query(`
      CREATE INDEX idx_subscriptions_status ON subscriptions(status)
    `);

    console.log('✅ Created table: subscriptions');

    // ==================== TABLE: user_workspaces ====================
    await client.query(`
      CREATE TABLE user_workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        workspace_name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        
        donation_url VARCHAR(255),
        overlay_url VARCHAR(255),
        webhook_url VARCHAR(255),
        
        is_active BOOLEAN DEFAULT TRUE,
        is_public BOOLEAN DEFAULT FALSE,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(user_id, workspace_name)
      )
    `);

    await client.query(`
      CREATE INDEX idx_workspaces_user ON user_workspaces(user_id)
    `);
    await client.query(`
      CREATE INDEX idx_workspaces_slug ON user_workspaces(slug)
    `);

    console.log('✅ Created table: user_workspaces');

    // ==================== TABLE: workspace_settings ====================
    await client.query(`
      CREATE TABLE workspace_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
        
        goal_title VARCHAR(255) DEFAULT '斗內目標',
        goal_amount INTEGER DEFAULT 1000,
        goal_start_from INTEGER DEFAULT 0,
        goal_reset_frequency VARCHAR(20),
        goal_last_reset TIMESTAMP WITH TIME ZONE,
        
        total_amount INTEGER DEFAULT 0,
        total_donations_count INTEGER DEFAULT 0,
        
        overlay_settings JSONB DEFAULT '{}',
        custom_css TEXT,
        custom_js TEXT,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(workspace_id)
      )
    `);

    await client.query(`
      CREATE INDEX idx_workspace_settings_workspace ON workspace_settings(workspace_id)
    `);

    console.log('✅ Created table: workspace_settings');

    // ==================== TABLE: payment_providers ====================
    await client.query(`
      CREATE TABLE payment_providers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
        
        provider_name VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        is_sandbox BOOLEAN DEFAULT FALSE,
        
        merchant_id VARCHAR(255),
        hash_key VARCHAR(255),
        hash_iv VARCHAR(255),
        
        credentials JSONB DEFAULT '{}',
        api_url TEXT,
        webhook_secret VARCHAR(255),
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(workspace_id, provider_name)
      )
    `);

    await client.query(`
      CREATE INDEX idx_payment_providers_workspace ON payment_providers(workspace_id)
    `);

    console.log('✅ Created table: payment_providers');

    // ==================== TABLE: donations (NEW) ====================
    // Rename old donations table first
    await client.query(`
      ALTER TABLE IF EXISTS donations RENAME TO donations_old
    `);

    await client.query(`
      CREATE TABLE donations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
        payment_provider_id UUID REFERENCES payment_providers(id) ON DELETE SET NULL,
        
        trade_no VARCHAR(100) NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR(3) DEFAULT 'TWD',
        payer_name VARCHAR(255) DEFAULT 'Anonymous',
        message TEXT DEFAULT '',
        
        status VARCHAR(20) DEFAULT 'completed',
        payment_method VARCHAR(50),
        
        ip_address INET,
        user_agent TEXT,
        metadata JSONB DEFAULT '{}',
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        refunded_at TIMESTAMP WITH TIME ZONE,
        
        UNIQUE(workspace_id, trade_no)
      )
    `);

    await client.query(`
      CREATE INDEX idx_donations_workspace ON donations(workspace_id)
    `);
    await client.query(`
      CREATE INDEX idx_donations_trade_no ON donations(trade_no)
    `);
    await client.query(`
      CREATE INDEX idx_donations_created_at ON donations(created_at DESC)
    `);
    await client.query(`
      CREATE INDEX idx_donations_status ON donations(status)
    `);

    console.log('✅ Created table: donations (old table renamed to donations_old)');

    // ==================== TABLE: api_keys ====================
    await client.query(`
      CREATE TABLE api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace_id UUID REFERENCES user_workspaces(id) ON DELETE CASCADE,
        
        key_name VARCHAR(100) NOT NULL,
        key_hash VARCHAR(255) UNIQUE NOT NULL,
        key_prefix VARCHAR(20) NOT NULL,
        
        scopes TEXT[] DEFAULT '{"read"}',
        rate_limit INTEGER DEFAULT 1000,
        
        is_active BOOLEAN DEFAULT TRUE,
        last_used_at TIMESTAMP WITH TIME ZONE,
        usage_count INTEGER DEFAULT 0,
        
        expires_at TIMESTAMP WITH TIME ZONE,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX idx_api_keys_user ON api_keys(user_id)
    `);
    await client.query(`
      CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id)
    `);
    await client.query(`
      CREATE INDEX idx_api_keys_hash ON api_keys(key_hash)
    `);

    console.log('✅ Created table: api_keys');

    // ==================== TABLE: audit_logs ====================
    await client.query(`
      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        workspace_id UUID REFERENCES user_workspaces(id) ON DELETE SET NULL,
        
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50),
        resource_id UUID,
        
        ip_address INET,
        user_agent TEXT,
        metadata JSONB DEFAULT '{}',
        
        status VARCHAR(20) DEFAULT 'success',
        error_message TEXT,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX idx_audit_logs_user ON audit_logs(user_id)
    `);
    await client.query(`
      CREATE INDEX idx_audit_logs_workspace ON audit_logs(workspace_id)
    `);
    await client.query(`
      CREATE INDEX idx_audit_logs_action ON audit_logs(action)
    `);
    await client.query(`
      CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC)
    `);

    console.log('✅ Created table: audit_logs\n');

    // ==================== MIGRATE DATA ====================
    console.log('📦 Migrating existing data...\n');

    // Get admin credentials from environment
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@localhost';
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
    const adminDisplayName = process.env.ADMIN_DISPLAY_NAME || 'Administrator';

    // Hash password
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    // Create admin user
    const userResult = await client.query(`
      INSERT INTO users (email, username, password_hash, display_name, is_active, auth_provider, email_verified)
      VALUES ($1, $2, $3, $4, TRUE, 'local', TRUE)
      RETURNING id
    `, [adminEmail, adminUsername, passwordHash, adminDisplayName]);

    const adminUserId = userResult.rows[0].id;
    console.log(`✅ Created admin user: ${adminUsername} (${adminEmail})`);

    // Create free subscription
    await client.query(`
      INSERT INTO subscriptions (user_id, plan_type, status, is_trial)
      VALUES ($1, 'free', 'active', FALSE)
    `, [adminUserId]);

    console.log('✅ Created free subscription');

    // Create default workspace
    const workspaceResult = await client.query(`
      INSERT INTO user_workspaces (user_id, workspace_name, slug, donation_url, overlay_url, webhook_url)
      VALUES ($1, 'Default Workspace', 'default', '/donate/default', '/overlay/default', '/webhook/default')
      RETURNING id
    `, [adminUserId]);

    const workspaceId = workspaceResult.rows[0].id;
    console.log('✅ Created default workspace');

    // Migrate app_data to workspace_settings
    const appDataResult = await client.query(`
      SELECT * FROM app_data WHERE id = 'main'
    `);

    if (appDataResult.rows.length > 0) {
      const appData = appDataResult.rows[0];
      
      await client.query(`
        INSERT INTO workspace_settings (
          workspace_id, goal_title, goal_amount, goal_start_from,
          total_amount, overlay_settings
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        workspaceId,
        appData.goal_title || '斗內目標',
        appData.goal_amount || 1000,
        appData.goal_start_from || 0,
        appData.total || 0,
        appData.overlay_settings || {}
      ]);

      console.log('✅ Migrated app_data to workspace_settings');

      // Migrate ECPay credentials
      if (appData.ecpay_merchant_id || appData.ecpay_hash_key || appData.ecpay_hash_iv) {
        const paymentResult = await client.query(`
          INSERT INTO payment_providers (
            workspace_id, provider_name, is_active,
            merchant_id, hash_key, hash_iv
          )
          VALUES ($1, 'ecpay', TRUE, $2, $3, $4)
          RETURNING id
        `, [
          workspaceId,
          appData.ecpay_merchant_id || '',
          appData.ecpay_hash_key || '',
          appData.ecpay_hash_iv || ''
        ]);

        const paymentProviderId = paymentResult.rows[0].id;
        console.log('✅ Migrated ECPay credentials');

        // Migrate donations
        const donationsResult = await client.query(`
          SELECT * FROM donations_old ORDER BY created_at
        `);

        if (donationsResult.rows.length > 0) {
          for (const donation of donationsResult.rows) {
            await client.query(`
              INSERT INTO donations (
                workspace_id, payment_provider_id, trade_no, amount,
                payer_name, message, status, created_at, completed_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $7)
            `, [
              workspaceId,
              paymentProviderId,
              donation.trade_no,
              donation.amount,
              donation.payer || 'Anonymous',
              donation.message || '',
              donation.created_at
            ]);
          }

          console.log(`✅ Migrated ${donationsResult.rows.length} donations`);

          // Update total_donations_count
          await client.query(`
            UPDATE workspace_settings
            SET total_donations_count = $1
            WHERE workspace_id = $2
          `, [donationsResult.rows.length, workspaceId]);
        }
      }
    } else {
      // No existing data, create default settings
      await client.query(`
        INSERT INTO workspace_settings (workspace_id)
        VALUES ($1)
      `, [workspaceId]);

      console.log('✅ Created default workspace_settings');
    }

    // Drop old tables
    await client.query(`DROP TABLE IF EXISTS app_data`);
    await client.query(`DROP TABLE IF EXISTS donations_old`);
    console.log('✅ Dropped old tables (app_data, donations_old)\n');

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Admin credentials:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Username: ${adminUsername}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('   ⚠️  CHANGE THE PASSWORD AFTER FIRST LOGIN!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await client.end();

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    await client.end();
    process.exit(1);
  }
}

// =============================================
// MIGRATION FOR JSON FILE (SANDBOX)
// =============================================
async function migrateSandbox() {
  const DB_PATH = path.join(__dirname, '.', 'db.json');
  const DB_BACKUP_PATH = path.join(__dirname, '.', 'db.json.backup');

  try {
    // Backup existing db.json
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
      console.log('✅ Backed up existing db.json to db.json.backup\n');

      const oldData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

      // Get admin credentials
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@localhost';
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const adminDisplayName = process.env.ADMIN_DISPLAY_NAME || 'Administrator';

      const passwordHash = await bcrypt.hash(adminPassword, 10);
      const adminUserId = uuidv4();
      const workspaceId = uuidv4();
      const paymentProviderId = uuidv4();

      // Create new multi-user structure
      const newData = {
        users: [
          {
            id: adminUserId,
            email: adminEmail,
            username: adminUsername,
            passwordHash: passwordHash,
            displayName: adminDisplayName,
            avatarUrl: null,
            authProvider: 'local',
            oauthProviderId: null,
            emailVerified: true,
            isActive: true,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            lastLoginAt: null,
            updatedAt: new Date().toISOString()
          }
        ],
        subscriptions: [
          {
            id: uuidv4(),
            userId: adminUserId,
            planType: 'free',
            status: 'active',
            pricePerMonth: 0,
            currency: 'TWD',
            isTrial: false,
            features: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        workspaces: [
          {
            id: workspaceId,
            userId: adminUserId,
            workspaceName: 'Default Workspace',
            slug: 'default',
            description: 'Migrated from single-user setup',
            donationUrl: '/donate/default',
            overlayUrl: '/overlay/default',
            webhookUrl: '/webhook/default',
            isActive: true,
            isPublic: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        workspaceSettings: [
          {
            id: uuidv4(),
            workspaceId: workspaceId,
            goalTitle: oldData.goal?.title || '斗內目標',
            goalAmount: oldData.goal?.amount || 1000,
            goalStartFrom: oldData.goal?.startFrom || 0,
            totalAmount: oldData.total || 0,
            totalDonationsCount: oldData.donations?.length || 0,
            overlaySettings: oldData.overlaySettings || {},
            customCss: null,
            customJs: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        paymentProviders: [
          {
            id: paymentProviderId,
            workspaceId: workspaceId,
            providerName: 'ecpay',
            isActive: true,
            isSandbox: false,
            merchantId: oldData.ecpay?.merchantId || '',
            hashKey: oldData.ecpay?.hashKey || '',
            hashIV: oldData.ecpay?.hashIV || '',
            credentials: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        donations: (oldData.donations || []).map(d => ({
          id: uuidv4(),
          workspaceId: workspaceId,
          paymentProviderId: paymentProviderId,
          tradeNo: d.tradeNo,
          amount: d.amount,
          currency: 'TWD',
          payerName: d.payer || 'Anonymous',
          message: d.message || '',
          status: 'completed',
          paymentMethod: null,
          metadata: {},
          createdAt: d.at,
          completedAt: d.at,
          refundedAt: null
        })),
        apiKeys: [],
        auditLogs: []
      };

      fs.writeFileSync(DB_PATH, JSON.stringify(newData, null, 2));
      console.log('✅ Migrated db.json to multi-user format\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 Admin credentials:');
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Username: ${adminUsername}`);
      console.log(`   Password: ${adminPassword}`);
      console.log('   ⚠️  CHANGE THE PASSWORD AFTER FIRST LOGIN!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } else {
      console.log('⚠️  No existing db.json found. Creating new multi-user structure...\n');
      
      // Create new structure from scratch
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@localhost';
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      const adminUserId = uuidv4();
      const workspaceId = uuidv4();

      const newData = {
        users: [{
          id: adminUserId,
          email: adminEmail,
          username: adminUsername,
          passwordHash: passwordHash,
          displayName: 'Administrator',
          authProvider: 'local',
          emailVerified: true,
          isActive: true,
          createdAt: new Date().toISOString()
        }],
        subscriptions: [{
          id: uuidv4(),
          userId: adminUserId,
          planType: 'free',
          status: 'active',
          createdAt: new Date().toISOString()
        }],
        workspaces: [{
          id: workspaceId,
          userId: adminUserId,
          workspaceName: 'Default Workspace',
          slug: 'default',
          isActive: true,
          createdAt: new Date().toISOString()
        }],
        workspaceSettings: [{
          id: uuidv4(),
          workspaceId: workspaceId,
          goalTitle: '斗內目標',
          goalAmount: 1000,
          goalStartFrom: 0,
          totalAmount: 0,
          totalDonationsCount: 0,
          overlaySettings: {},
          createdAt: new Date().toISOString()
        }],
        paymentProviders: [],
        donations: [],
        apiKeys: [],
        auditLogs: []
      };

      fs.writeFileSync(DB_PATH, JSON.stringify(newData, null, 2));
      console.log('✅ Created new multi-user db.json\n');
    }

  } catch (error) {
    console.error('❌ Sandbox migration failed:', error);
    process.exit(1);
  }
}

// =============================================
// RUN MIGRATION
// =============================================
(async () => {
  if (isSandbox) {
    console.log('🧪 Running migration in SANDBOX mode (JSON file)\n');
    await migrateSandbox();
  } else {
    console.log('🐘 Running migration in POSTGRESQL mode\n');
    await migratePostgreSQL();
  }
  
  console.log('✨ Migration completed successfully!');
  process.exit(0);
})();
