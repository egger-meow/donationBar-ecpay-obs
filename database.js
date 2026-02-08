import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const { Client } = pg;

const __dirname = path.resolve();
const DB_PATH = path.join(__dirname, 'db.json');

// PostgreSQL connection
let pgClient = null;

/**
 * Multi-User Database Class
 * Supports both PostgreSQL (production) and JSON file (sandbox/dev)
 */
class Database {
  constructor() {
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

      let sslConfig = false;
      if (databaseUrl.includes('sslmode=require')) {
        let caCert = process.env.DATABASE_CA;

        // Decode Base64 if the cert doesn't start with -----BEGIN
        if (caCert && !caCert.startsWith('-----BEGIN')) {
          try {
            caCert = Buffer.from(caCert, 'base64').toString('utf-8');
            console.log('CA length:', caCert.length);
            console.log(caCert.slice(0, 30));
          } catch (e) {
            console.error('Failed to decode DATABASE_CA from Base64:', e.message);
          }
        }

        sslConfig = {
          rejectUnauthorized: true,
          ca: caCert,
          servername: 'donationbar-donationbar.j.aivencloud.com',
        };
      }

      // Parse DATABASE_URL to extract connection details
      const dbUrl = new URL(databaseUrl);

      pgClient = new Client({
        user: dbUrl.username,
        password: dbUrl.password,
        host: dbUrl.hostname,
        port: parseInt(dbUrl.port, 10),
        database: dbUrl.pathname.slice(1), // Remove leading '/'
        ssl: sslConfig
      });

      await pgClient.connect();
      this.connected = true;
      console.log('🐘 Connected to PostgreSQL (Multi-User Mode)');

    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      console.log('📝 Falling back to JSON file storage');
      this.isProduction = false;
      this.connected = false;
    }
  }

  // =============================================
  // JSON FILE HELPERS (SANDBOX MODE)
  // =============================================

  async readJSON() {
    try {
      if (!fs.existsSync(DB_PATH)) {
        const defaultData = this.getDefaultMultiUserData();
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2));
        return defaultData;
      }
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (error) {
      console.error('Error reading JSON database:', error);
      return this.getDefaultMultiUserData();
    }
  }

  async writeJSON(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  }

  getDefaultMultiUserData() {
    return {
      users: [],
      subscriptions: [],
      workspaces: [],
      workspaceSettings: [],
      paymentProviders: [],
      donations: [],
      paymentHistory: [],
      apiKeys: [],
      feedback: [],
      fraudPrevention: [],
      auditLogs: []
    };
  }

  // =============================================
  // USER METHODS
  // =============================================

  /**
   * Create a new user
   * @param {Object} userData - {email, username, passwordHash, displayName, authProvider}
   * @returns {Object} Created user
   */
  async createUser(userData) {
    if (this.isProduction && this.connected) {
      // Check if any admin exists
      const adminCheck = await pgClient.query('SELECT COUNT(*) FROM users WHERE is_admin = TRUE');
      const hasAdmin = parseInt(adminCheck.rows[0].count) > 0;

      // Auto-promote specific user to admin if no admin exists
      const isAdmin = !hasAdmin && userData.email === 'inpire.mg09@nycu.edu.tw';
      const displayName = userData.email === 'inpire.mg09@nycu.edu.tw' ? 'jjmow' : (userData.displayName || userData.username);

      const result = await pgClient.query(`
        INSERT INTO users (email, username, password_hash, display_name, auth_provider, oauth_provider_id, is_admin)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        userData.email,
        userData.username,
        userData.passwordHash || null,
        displayName,
        userData.authProvider || 'local',
        userData.oauthProviderId || null,
        isAdmin
      ]);

      if (isAdmin) {
        console.log('👑 Auto-promoted user to admin:', userData.email);
      }

      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();

      // Check if any admin exists
      const hasAdmin = data.users.some(u => u.isAdmin === true);

      // Auto-promote specific user to admin if no admin exists
      const isAdmin = !hasAdmin && userData.email === 'inpire.mg09@nycu.edu.tw';
      const displayName = userData.email === 'inpire.mg09@nycu.edu.tw' ? 'jjmow' : (userData.displayName || userData.username);

      const newUser = {
        id: uuidv4(),
        email: userData.email,
        username: userData.username,
        passwordHash: userData.passwordHash || null,
        displayName: displayName,
        avatarUrl: null,
        authProvider: userData.authProvider || 'local',
        oauthProviderId: userData.oauthProviderId || null,
        emailVerified: false,
        isActive: true,
        isAdmin: isAdmin,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
        updatedAt: new Date().toISOString()
      };

      if (isAdmin) {
        console.log('👑 Auto-promoted user to admin:', userData.email);
      }

      data.users.push(newUser);
      await this.writeJSON(data);
      return newUser;
    }
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return data.users.find(u => u.email === email) || null;
    }
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query('SELECT * FROM users WHERE username = $1', [username]);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return data.users.find(u => u.username === username) || null;
    }
  }

  /**
   * Find user by ID
   */
  async findUserById(userId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query('SELECT * FROM users WHERE id = $1', [userId]);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return data.users.find(u => u.id === userId) || null;
    }
  }

  /**
   * Update user last login
   */
  async updateUserLastLogin(userId) {
    if (this.isProduction && this.connected) {
      await pgClient.query(
        'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
        [userId]
      );
    } else {
      const data = await this.readJSON();
      const user = data.users.find(u => u.id === userId);
      if (user) {
        user.lastLoginAt = new Date().toISOString();
        user.updatedAt = new Date().toISOString();
        await this.writeJSON(data);
      }
    }
  }

  // =============================================
  // WORKSPACE METHODS
  // =============================================

  /**
   * Create a new workspace for a user
   */
  async createWorkspace(userId, workspaceData) {
    if (this.isProduction && this.connected) {
      await pgClient.query('BEGIN');
      try {
        // Create workspace
        const workspaceResult = await pgClient.query(`
          INSERT INTO user_workspaces (user_id, workspace_name, slug, donation_url, overlay_url, webhook_url)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [
          userId,
          workspaceData.workspaceName,
          workspaceData.slug,
          `/donate/${workspaceData.slug}`,
          `/overlay/${workspaceData.slug}`,
          `/webhook/${workspaceData.slug}`
        ]);

        const workspace = this.camelCaseKeys(workspaceResult.rows[0]);

        // Create default settings
        await pgClient.query(`
          INSERT INTO workspace_settings (workspace_id)
          VALUES ($1)
        `, [workspace.id]);

        await pgClient.query('COMMIT');
        return workspace;
      } catch (error) {
        await pgClient.query('ROLLBACK');
        throw error;
      }
    } else {
      const data = await this.readJSON();
      const newWorkspace = {
        id: uuidv4(),
        userId,
        workspaceName: workspaceData.workspaceName,
        slug: workspaceData.slug,
        description: workspaceData.description || null,
        donationUrl: `/donate/${workspaceData.slug}`,
        overlayUrl: `/overlay/${workspaceData.slug}`,
        webhookUrl: `/webhook/${workspaceData.slug}`,
        isActive: true,
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const newSettings = {
        id: uuidv4(),
        workspaceId: newWorkspace.id,
        goalTitle: '斗內目標',
        goalAmount: 1000,
        goalStartFrom: 0,
        totalAmount: 0,
        totalDonationsCount: 0,
        overlaySettings: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      data.workspaces.push(newWorkspace);
      data.workspaceSettings.push(newSettings);
      await this.writeJSON(data);
      return newWorkspace;
    }
  }

  /**
   * Get all workspaces for a user
   */
  async getUserWorkspaces(userId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM user_workspaces WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows.map(row => this.camelCaseKeys(row));
    } else {
      const data = await this.readJSON();
      return data.workspaces.filter(w => w.userId === userId);
    }
  }

  /**
   * Get workspace by slug
   */
  async getWorkspaceBySlug(slug) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query('SELECT * FROM user_workspaces WHERE slug = $1', [slug]);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return data.workspaces.find(w => w.slug === slug) || null;
    }
  }

  /**
   * Get workspace by ID
   */
  async getWorkspaceById(workspaceId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query('SELECT * FROM user_workspaces WHERE id = $1', [workspaceId]);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return data.workspaces.find(w => w.id === workspaceId) || null;
    }
  }

  /**
   * Get all workspaces
   */
  async getAllWorkspaces() {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query('SELECT * FROM user_workspaces');
      return result.rows.map(row => this.camelCaseKeys(row));
    } else {
      const data = await this.readJSON();
      return data.workspaces || [];
    }
  }

  // =============================================
  // WORKSPACE SETTINGS METHODS
  // =============================================

  /**
   * Get workspace settings
   */
  async getWorkspaceSettings(workspaceId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM workspace_settings WHERE workspace_id = $1',
        [workspaceId]
      );
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return data.workspaceSettings.find(s => s.workspaceId === workspaceId) || null;
    }
  }

  /**
   * Update workspace settings
   */
  async updateWorkspaceSettings(workspaceId, settings) {
    if (this.isProduction && this.connected) {
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (settings.goalTitle !== undefined) {
        updates.push(`goal_title = $${paramCount++}`);
        values.push(settings.goalTitle);
      }
      if (settings.goalAmount !== undefined) {
        updates.push(`goal_amount = $${paramCount++}`);
        values.push(settings.goalAmount);
      }
      if (settings.goalStartFrom !== undefined) {
        updates.push(`goal_start_from = $${paramCount++}`);
        values.push(settings.goalStartFrom);
      }
      if (settings.overlaySettings !== undefined) {
        updates.push(`overlay_settings = $${paramCount++}`);
        values.push(JSON.stringify(settings.overlaySettings));
      }

      updates.push(`updated_at = NOW()`);
      values.push(workspaceId);

      await pgClient.query(
        `UPDATE workspace_settings SET ${updates.join(', ')} WHERE workspace_id = $${paramCount}`,
        values
      );
    } else {
      const data = await this.readJSON();
      const settingsIdx = data.workspaceSettings.findIndex(s => s.workspaceId === workspaceId);
      if (settingsIdx !== -1) {
        if (settings.goalTitle !== undefined) data.workspaceSettings[settingsIdx].goalTitle = settings.goalTitle;
        if (settings.goalAmount !== undefined) data.workspaceSettings[settingsIdx].goalAmount = settings.goalAmount;
        if (settings.goalStartFrom !== undefined) data.workspaceSettings[settingsIdx].goalStartFrom = settings.goalStartFrom;
        if (settings.overlaySettings !== undefined) data.workspaceSettings[settingsIdx].overlaySettings = settings.overlaySettings;
        data.workspaceSettings[settingsIdx].updatedAt = new Date().toISOString();
        await this.writeJSON(data);
      }
    }
  }

  // =============================================
  // PAYMENT PROVIDER METHODS
  // =============================================

  /**
   * Get payment provider for workspace
   */
  async getPaymentProvider(workspaceId, providerName = 'ecpay') {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM payment_providers WHERE workspace_id = $1 AND provider_name = $2',
        [workspaceId, providerName]
      );
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return data.paymentProviders.find(
        p => p.workspaceId === workspaceId && p.providerName === providerName
      ) || null;
    }
  }

  /**
   * Create or update payment provider
   */
  async upsertPaymentProvider(workspaceId, providerData) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        INSERT INTO payment_providers (workspace_id, provider_name, merchant_id, hash_key, hash_iv, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (workspace_id, provider_name)
        DO UPDATE SET merchant_id = $3, hash_key = $4, hash_iv = $5, is_active = $6, updated_at = NOW()
        RETURNING *
      `, [
        workspaceId,
        providerData.providerName || 'ecpay',
        providerData.merchantId,
        providerData.hashKey,
        providerData.hashIV,
        providerData.isActive !== false
      ]);
      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();
      const existingIdx = data.paymentProviders.findIndex(
        p => p.workspaceId === workspaceId && p.providerName === (providerData.providerName || 'ecpay')
      );

      if (existingIdx !== -1) {
        // Update
        data.paymentProviders[existingIdx] = {
          ...data.paymentProviders[existingIdx],
          merchantId: providerData.merchantId,
          hashKey: providerData.hashKey,
          hashIV: providerData.hashIV,
          isActive: providerData.isActive !== false,
          updatedAt: new Date().toISOString()
        };
      } else {
        // Create
        data.paymentProviders.push({
          id: uuidv4(),
          workspaceId,
          providerName: providerData.providerName || 'ecpay',
          isActive: providerData.isActive !== false,
          isSandbox: false,
          merchantId: providerData.merchantId,
          hashKey: providerData.hashKey,
          hashIV: providerData.hashIV,
          credentials: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      await this.writeJSON(data);
      return data.paymentProviders[existingIdx !== -1 ? existingIdx : data.paymentProviders.length - 1];
    }
  }

  // =============================================
  // DONATION METHODS
  // =============================================

  /**
   * Add a new donation
   */
  async addDonation(workspaceId, donationData) {
    if (this.isProduction && this.connected) {
      try {
        await pgClient.query('BEGIN');

        // Check for duplicate
        const existing = await pgClient.query(
          'SELECT id FROM donations WHERE workspace_id = $1 AND trade_no = $2',
          [workspaceId, donationData.tradeNo]
        );

        if (existing.rows.length > 0) {
          await pgClient.query('ROLLBACK');
          console.log(`Duplicate trade number: ${donationData.tradeNo}`);
          return false;
        }

        // Insert donation
        await pgClient.query(`
          INSERT INTO donations (
            workspace_id, payment_provider_id, trade_no, amount, currency,
            payer_name, message, status, completed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW())
        `, [
          workspaceId,
          donationData.paymentProviderId || null,
          donationData.tradeNo,
          Number(donationData.amount),
          donationData.currency || 'TWD',
          donationData.payerName || 'Anonymous',
          donationData.message || ''
        ]);

        // Update totals
        await pgClient.query(`
          UPDATE workspace_settings
          SET total_amount = total_amount + $1,
              total_donations_count = total_donations_count + 1,
              updated_at = NOW()
          WHERE workspace_id = $2
        `, [Number(donationData.amount), workspaceId]);

        await pgClient.query('COMMIT');
        console.log(`New donation: ${donationData.payerName} donated $${donationData.amount}`);
        return true;

      } catch (error) {
        await pgClient.query('ROLLBACK');
        if (error.code === '23505') { // Unique violation
          console.log(`Duplicate trade number: ${donationData.tradeNo}`);
          return false;
        }
        throw error;
      }
    } else {
      const data = await this.readJSON();

      // Check for duplicate
      const existing = data.donations.find(
        d => d.workspaceId === workspaceId && d.tradeNo === donationData.tradeNo
      );
      if (existing) {
        console.log(`Duplicate trade number: ${donationData.tradeNo}`);
        return false;
      }

      // Add donation
      data.donations.push({
        id: uuidv4(),
        workspaceId,
        paymentProviderId: donationData.paymentProviderId || null,
        tradeNo: donationData.tradeNo,
        amount: Number(donationData.amount),
        currency: donationData.currency || 'TWD',
        payerName: donationData.payerName || 'Anonymous',
        message: donationData.message || '',
        status: 'completed',
        paymentMethod: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        refundedAt: null
      });

      // Update totals
      const settingsIdx = data.workspaceSettings.findIndex(s => s.workspaceId === workspaceId);
      if (settingsIdx !== -1) {
        data.workspaceSettings[settingsIdx].totalAmount += Number(donationData.amount);
        data.workspaceSettings[settingsIdx].totalDonationsCount += 1;
        data.workspaceSettings[settingsIdx].updatedAt = new Date().toISOString();
      }

      await this.writeJSON(data);
      console.log(`New donation: ${donationData.payerName} donated $${donationData.amount}`);
      return true;
    }
  }

  /**
   * Get donations for a workspace
   */
  async getWorkspaceDonations(workspaceId, limit = 100) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM donations WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2',
        [workspaceId, limit]
      );
      return result.rows.map(row => this.camelCaseKeys(row));
    } else {
      const data = await this.readJSON();
      return data.donations
        .filter(d => d.workspaceId === workspaceId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
    }
  }

  /**
   * Get donation progress for a workspace
   */
  async getWorkspaceProgress(workspaceId) {
    const settings = await this.getWorkspaceSettings(workspaceId);
    const donations = await this.getWorkspaceDonations(workspaceId, 10);

    if (!settings) {
      return null;
    }

    return {
      goal: {
        title: settings.goalTitle,
        amount: settings.goalAmount,
        startFrom: settings.goalStartFrom
      },
      total: settings.totalAmount,
      donations: donations.map(d => ({
        tradeNo: d.tradeNo,
        amount: d.amount,
        payer: d.payerName,
        message: d.message,
        at: d.createdAt
      })),
      overlaySettings: settings.overlaySettings || {}
    };
  }

  /**
   * Clear all donations for a workspace
   */
  async clearWorkspaceDonations(workspaceId) {
    if (this.isProduction && this.connected) {
      await pgClient.query('BEGIN');
      try {
        await pgClient.query('DELETE FROM donations WHERE workspace_id = $1', [workspaceId]);
        await pgClient.query(`
          UPDATE workspace_settings
          SET total_amount = 0, total_donations_count = 0, goal_start_from = 0, updated_at = NOW()
          WHERE workspace_id = $1
        `, [workspaceId]);
        await pgClient.query('COMMIT');
        console.log('✨ All donations cleared');
        return true;
      } catch (error) {
        await pgClient.query('ROLLBACK');
        throw error;
      }
    } else {
      const data = await this.readJSON();
      data.donations = data.donations.filter(d => d.workspaceId !== workspaceId);
      const settingsIdx = data.workspaceSettings.findIndex(s => s.workspaceId === workspaceId);
      if (settingsIdx !== -1) {
        data.workspaceSettings[settingsIdx].totalAmount = 0;
        data.workspaceSettings[settingsIdx].totalDonationsCount = 0;
        data.workspaceSettings[settingsIdx].goalStartFrom = 0;
        data.workspaceSettings[settingsIdx].updatedAt = new Date().toISOString();
      }
      await this.writeJSON(data);
      console.log('✨ All donations cleared');
      return true;
    }
  }

  // =============================================
  // SUBSCRIPTION METHODS
  // =============================================

  /**
   * Get user subscription
   */
  async getUserSubscription(userId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query('SELECT * FROM subscriptions WHERE user_id = $1', [userId]);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return data.subscriptions.find(s => s.userId === userId) || null;
    }
  }

  /**
   * Check if device/IP has already used trial (fraud prevention)
   */
  async hasUsedTrial(fingerprint) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT COUNT(*) FROM fraud_prevention WHERE fingerprint = $1 AND action_type = $2',
        [fingerprint, 'trial_used']
      );
      return parseInt(result.rows[0].count) > 0;
    } else {
      const data = await this.readJSON();
      return data.fraudPrevention?.some(
        fp => fp.fingerprint === fingerprint && fp.actionType === 'trial_used'
      ) || false;
    }
  }

  /**
   * Record trial usage to prevent abuse
   */
  async recordTrialUsage(userId, fingerprint, metadata = {}) {
    if (this.isProduction && this.connected) {
      await pgClient.query(`
        INSERT INTO fraud_prevention (
          user_id, fingerprint, action_type, ip_address, user_agent, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        userId,
        fingerprint,
        'trial_used',
        metadata.ipAddress || null,
        metadata.userAgent || null,
        JSON.stringify(metadata)
      ]);
    } else {
      const data = await this.readJSON();
      if (!data.fraudPrevention) data.fraudPrevention = [];

      data.fraudPrevention.push({
        id: uuidv4(),
        userId,
        fingerprint,
        actionType: 'trial_used',
        ipAddress: metadata.ipAddress || null,
        userAgent: metadata.userAgent || null,
        metadata,
        createdAt: new Date().toISOString()
      });

      await this.writeJSON(data);
    }
    console.log(`🛡️ Trial usage recorded for fingerprint: ${fingerprint}`);
  }

  /**
   * Create subscription for user
   */
  async createSubscription(userId, subscriptionData) {
    // Calculate trial end date if this is a trial
    let trialEndDate = subscriptionData.trialEndDate || null;
    const isTrial = subscriptionData.isTrial !== undefined ? subscriptionData.isTrial : true; // Default to trial

    if (isTrial && !trialEndDate) {
      // Calculate trial end date based on SUBSCRIPTION_TRIAL_DAYS (default 30 days)
      const trialDays = parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS) || 30;
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + trialDays);
      trialEndDate = endDate.toISOString();
    }

    // Calculate billing cycle start date (for paid subscriptions)
    const billingCycleStart = subscriptionData.billingCycleStart || new Date().toISOString();

    // Calculate next billing date (for paid subscriptions)
    let nextBillingDate = subscriptionData.nextBillingDate || null;
    if (subscriptionData.planType === 'paid' || subscriptionData.planType === 'pro') {
      const nextDate = new Date(billingCycleStart);
      nextDate.setMonth(nextDate.getMonth() + 1); // Add 1 month
      nextBillingDate = nextDate.toISOString();
    }

    const pricePerMonth = subscriptionData.pricePerMonth !== undefined
      ? subscriptionData.pricePerMonth
      : (subscriptionData.planType === 'free' ? 0 : parseInt(process.env.SUBSCRIPTION_MONTHLY_PRICE) || 70);

    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        INSERT INTO subscriptions (
          user_id, plan_type, status, is_trial, trial_end_date,
          price_per_month, currency, billing_cycle_start, next_billing_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        userId,
        subscriptionData.planType || 'free',
        subscriptionData.status || 'active',
        isTrial,
        trialEndDate,
        pricePerMonth,
        subscriptionData.currency || 'TWD',
        billingCycleStart,
        nextBillingDate
      ]);
      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();
      const newSubscription = {
        id: uuidv4(),
        userId,
        planType: subscriptionData.planType || 'free',
        status: subscriptionData.status || 'active',
        pricePerMonth,
        currency: subscriptionData.currency || 'TWD',
        isTrial,
        trialEndDate,
        billingCycleStart,
        nextBillingDate,
        features: subscriptionData.features || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.subscriptions.push(newSubscription);
      await this.writeJSON(data);
      return newSubscription;
    }
  }

  /**
   * Update subscription for user
   */
  async updateSubscription(userId, updateData) {
    if (this.isProduction && this.connected) {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic UPDATE query
      if (updateData.planType !== undefined) {
        fields.push(`plan_type = $${paramIndex++}`);
        values.push(updateData.planType);
      }
      if (updateData.status !== undefined) {
        fields.push(`status = $${paramIndex++}`);
        values.push(updateData.status);
      }
      if (updateData.isTrial !== undefined) {
        fields.push(`is_trial = $${paramIndex++}`);
        values.push(updateData.isTrial);
      }
      if (updateData.trialEndDate !== undefined) {
        fields.push(`trial_end_date = $${paramIndex++}`);
        values.push(updateData.trialEndDate);
      }
      if (updateData.pricePerMonth !== undefined) {
        fields.push(`price_per_month = $${paramIndex++}`);
        values.push(updateData.pricePerMonth);
      }
      if (updateData.nextBillingDate !== undefined) {
        fields.push(`next_billing_date = $${paramIndex++}`);
        values.push(updateData.nextBillingDate);
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId); // Last parameter for WHERE clause

      const query = `
        UPDATE subscriptions 
        SET ${fields.join(', ')}
        WHERE user_id = $${paramIndex}
        RETURNING *
      `;

      const result = await pgClient.query(query, values);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      const subscription = data.subscriptions.find(s => s.userId === userId);

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Update fields
      Object.assign(subscription, {
        ...updateData,
        updatedAt: new Date().toISOString()
      });

      await this.writeJSON(data);
      return subscription;
    }
  }

  // =============================================
  // PAYMENT HISTORY METHODS
  // =============================================

  /**
   * Create payment record
   */
  async createPaymentRecord(paymentData) {
    const paymentId = uuidv4();

    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        INSERT INTO payment_history (
          id, subscription_id, user_id, amount, currency, status,
          ecpay_trade_no, ecpay_merchant_trade_no, ecpay_payment_date,
          payment_method, payment_method_last4, payment_method_type,
          card_auth_code, card_first6, card_last4, issuing_bank, issuing_bank_code,
          error_message, error_code, retry_count,
          period_type, frequency, exec_times, total_success_times, total_success_amount,
          paid_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        RETURNING *
      `, [
        paymentId,
        paymentData.subscriptionId,
        paymentData.userId,
        paymentData.amount,
        paymentData.currency || 'TWD',
        paymentData.status,
        paymentData.ecpayTradeNo || null,
        paymentData.ecpayMerchantTradeNo || null,
        paymentData.ecpayPaymentDate || null,
        paymentData.paymentMethod || null,
        paymentData.paymentMethodLast4 || null,
        paymentData.paymentMethodType || null,
        paymentData.cardAuthCode || null,
        paymentData.cardFirst6 || null,
        paymentData.cardLast4 || null,
        paymentData.issuingBank || null,
        paymentData.issuingBankCode || null,
        paymentData.errorMessage || null,
        paymentData.errorCode || null,
        paymentData.retryCount || 0,
        paymentData.periodType || null,
        paymentData.frequency || null,
        paymentData.execTimes || null,
        paymentData.totalSuccessTimes || null,
        paymentData.totalSuccessAmount || null,
        paymentData.status === 'success' ? (paymentData.paidAt || new Date()) : null
      ]);
      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();
      if (!data.paymentHistory) data.paymentHistory = [];

      const newPayment = {
        id: paymentId,
        subscriptionId: paymentData.subscriptionId,
        userId: paymentData.userId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'TWD',
        status: paymentData.status,
        ecpayTradeNo: paymentData.ecpayTradeNo || null,
        ecpayMerchantTradeNo: paymentData.ecpayMerchantTradeNo || null,
        ecpayPaymentDate: paymentData.ecpayPaymentDate || null,
        paymentMethod: paymentData.paymentMethod || null,
        paymentMethodLast4: paymentData.paymentMethodLast4 || null,
        paymentMethodType: paymentData.paymentMethodType || null,
        cardAuthCode: paymentData.cardAuthCode || null,
        cardFirst6: paymentData.cardFirst6 || null,
        cardLast4: paymentData.cardLast4 || null,
        issuingBank: paymentData.issuingBank || null,
        issuingBankCode: paymentData.issuingBankCode || null,
        errorMessage: paymentData.errorMessage || null,
        errorCode: paymentData.errorCode || null,
        retryCount: paymentData.retryCount || 0,
        periodType: paymentData.periodType || null,
        frequency: paymentData.frequency || null,
        execTimes: paymentData.execTimes || null,
        totalSuccessTimes: paymentData.totalSuccessTimes || null,
        totalSuccessAmount: paymentData.totalSuccessAmount || null,
        createdAt: new Date().toISOString(),
        paidAt: paymentData.status === 'success' ? (paymentData.paidAt || new Date().toISOString()) : null,
        updatedAt: new Date().toISOString()
      };

      data.paymentHistory.push(newPayment);
      await this.writeJSON(data);
      return newPayment;
    }
  }

  /**
   * Get payment history for a subscription
   */
  async getPaymentHistory(subscriptionId, limit = 50) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        SELECT * FROM payment_history
        WHERE subscription_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [subscriptionId, limit]);
      return result.rows.map(row => this.camelCaseKeys(row));
    } else {
      const data = await this.readJSON();
      if (!data.paymentHistory) return [];

      return data.paymentHistory
        .filter(p => p.subscriptionId === subscriptionId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
    }
  }

  /**
   * Get payment history for a user (across all subscriptions)
   */
  async getUserPaymentHistory(userId, limit = 50) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        SELECT * FROM payment_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userId, limit]);
      return result.rows.map(row => this.camelCaseKeys(row));
    } else {
      const data = await this.readJSON();
      if (!data.paymentHistory) return [];

      return data.paymentHistory
        .filter(p => p.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
    }
  }

  /**
   * Update payment record
   */
  async updatePaymentRecord(paymentId, updateData) {
    if (this.isProduction && this.connected) {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (updateData.status !== undefined) {
        fields.push(`status = $${paramIndex++}`);
        values.push(updateData.status);
      }
      if (updateData.errorMessage !== undefined) {
        fields.push(`error_message = $${paramIndex++}`);
        values.push(updateData.errorMessage);
      }
      if (updateData.errorCode !== undefined) {
        fields.push(`error_code = $${paramIndex++}`);
        values.push(updateData.errorCode);
      }
      if (updateData.retryCount !== undefined) {
        fields.push(`retry_count = $${paramIndex++}`);
        values.push(updateData.retryCount);
      }
      if (updateData.nextRetryAt !== undefined) {
        fields.push(`next_retry_at = $${paramIndex++}`);
        values.push(updateData.nextRetryAt);
      }

      fields.push(`updated_at = NOW()`);
      values.push(paymentId);

      const query = `
        UPDATE payment_history 
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await pgClient.query(query, values);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      if (!data.paymentHistory) return null;

      const payment = data.paymentHistory.find(p => p.id === paymentId);
      if (!payment) return null;

      Object.assign(payment, {
        ...updateData,
        updatedAt: new Date().toISOString()
      });

      await this.writeJSON(data);
      return payment;
    }
  }

  /**
   * Get failed payments that need retry
   */
  async getFailedPaymentsForRetry() {
    const now = new Date();

    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        SELECT * FROM payment_history
        WHERE status = 'failed'
        AND retry_count < 3
        AND (next_retry_at IS NULL OR next_retry_at <= $1)
        ORDER BY created_at ASC
        LIMIT 100
      `, [now]);
      return result.rows.map(row => this.camelCaseKeys(row));
    } else {
      const data = await this.readJSON();
      if (!data.paymentHistory) return [];

      return data.paymentHistory
        .filter(p =>
          p.status === 'failed' &&
          (p.retryCount || 0) < 3 &&
          (!p.nextRetryAt || new Date(p.nextRetryAt) <= now)
        )
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .slice(0, 100);
    }
  }

  // =============================================
  // FEEDBACK METHODS
  // =============================================

  /**
   * Create feedback
   * @param {Object} feedbackData - {userId, type, message, email, metadata}
   */
  async createFeedback(feedbackData) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        INSERT INTO feedback (user_id, type, message, email, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        feedbackData.userId || null,
        feedbackData.type,
        feedbackData.message,
        feedbackData.email || null,
        JSON.stringify(feedbackData.metadata || {})
      ]);
      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();

      // Ensure feedback array exists (backward compatibility)
      if (!data.feedback) {
        data.feedback = [];
      }

      const newFeedback = {
        id: uuidv4(),
        userId: feedbackData.userId || null,
        type: feedbackData.type,
        message: feedbackData.message,
        email: feedbackData.email || null,
        status: feedbackData.status || 'new',
        metadata: feedbackData.metadata || {},
        createdAt: new Date().toISOString(),
        resolvedAt: null
      };
      data.feedback.push(newFeedback);
      await this.writeJSON(data);
      return newFeedback;
    }
  }

  /**
   * Get all feedback
   * @param {Object} options - {limit, status}
   */
  async getFeedback(options = {}) {
    const { limit = 100, status = null } = options;

    if (this.isProduction && this.connected) {
      let query = 'SELECT * FROM feedback';
      const params = [];

      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await pgClient.query(query, params);
      return result.rows.map(row => this.camelCaseKeys(row));
    } else {
      const data = await this.readJSON();
      let feedback = data.feedback || [];

      if (status) {
        feedback = feedback.filter(f => f.status === status);
      }

      return feedback
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
    }
  }

  /**
   * Update feedback status
   * @param {string} feedbackId
   * @param {string} status - 'new', 'reviewing', 'resolved', 'closed'
   */
  async updateFeedbackStatus(feedbackId, status) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        UPDATE feedback
        SET status = $1, resolved_at = $2
        WHERE id = $3
        RETURNING *
      `, [status, status === 'resolved' ? new Date() : null, feedbackId]);
      return result.rows[0] ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      const feedback = data.feedback.find(f => f.id === feedbackId);
      if (feedback) {
        feedback.status = status;
        if (status === 'resolved') {
          feedback.resolvedAt = new Date().toISOString();
        }
        await this.writeJSON(data);
        return feedback;
      }
      return null;
    }
  }

  // =============================================
  // UTILITY METHODS
  // =============================================

  /**
   * Convert snake_case keys to camelCase
   */
  camelCaseKeys(obj) {
    const result = {};
    for (const key in obj) {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      result[camelKey] = obj[key];
    }
    return result;
  }

  /**
   * Add audit log
   */
  async addAuditLog(logData) {
    if (this.isProduction && this.connected) {
      await pgClient.query(`
        INSERT INTO audit_logs (user_id, workspace_id, action, resource_type, resource_id, status, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        logData.userId || null,
        logData.workspaceId || null,
        logData.action,
        logData.resourceType || null,
        logData.resourceId || null,
        logData.status || 'success',
        JSON.stringify(logData.metadata || {})
      ]);
    } else {
      const data = await this.readJSON();
      data.auditLogs.push({
        id: uuidv4(),
        userId: logData.userId || null,
        workspaceId: logData.workspaceId || null,
        action: logData.action,
        resourceType: logData.resourceType || null,
        resourceId: logData.resourceId || null,
        status: logData.status || 'success',
        metadata: logData.metadata || {},
        createdAt: new Date().toISOString()
      });
      // Keep only last 1000 logs in JSON
      if (data.auditLogs.length > 1000) {
        data.auditLogs = data.auditLogs.slice(-1000);
      }
      await this.writeJSON(data);
    }
  }
}

export default new Database();
