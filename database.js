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

      pgClient = new Client({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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
      apiKeys: [],
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
      const result = await pgClient.query(`
        INSERT INTO users (email, username, password_hash, display_name, auth_provider, oauth_provider_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        userData.email,
        userData.username,
        userData.passwordHash || null,
        userData.displayName || userData.username,
        userData.authProvider || 'local',
        userData.oauthProviderId || null
      ]);
      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();
      const newUser = {
        id: uuidv4(),
        email: userData.email,
        username: userData.username,
        passwordHash: userData.passwordHash || null,
        displayName: userData.displayName || userData.username,
        avatarUrl: null,
        authProvider: userData.authProvider || 'local',
        oauthProviderId: userData.oauthProviderId || null,
        emailVerified: false,
        isActive: true,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
        updatedAt: new Date().toISOString()
      };
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
   * Create subscription for user
   */
  async createSubscription(userId, subscriptionData) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        INSERT INTO subscriptions (user_id, plan_type, status, is_trial, trial_end_date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        userId,
        subscriptionData.planType || 'free',
        subscriptionData.status || 'active',
        subscriptionData.isTrial || false,
        subscriptionData.trialEndDate || null
      ]);
      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();
      const newSubscription = {
        id: uuidv4(),
        userId,
        planType: subscriptionData.planType || 'free',
        status: subscriptionData.status || 'active',
        pricePerMonth: 0,
        currency: 'TWD',
        isTrial: subscriptionData.isTrial || false,
        trialEndDate: subscriptionData.trialEndDate || null,
        features: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.subscriptions.push(newSubscription);
      await this.writeJSON(data);
      return newSubscription;
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
