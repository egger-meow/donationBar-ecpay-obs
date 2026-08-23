import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getSubscriptionPlan, isPlatformAdminEmail } from './config.js';
import { decryptCredential, encryptCredential } from './credentials.js';
import { decryptProviderCredentials, isMerchantIdSharedAcrossWorkspaces } from './payment-provider-credentials.js';
import { databaseSsl } from './database-ssl.js';
import { computeActivationFunnel } from './activation.js';
import { withTimeout } from './promise-timeout.js';
import { logError, logInfo, logWarn } from './observability.js';
import { normalizeCurrency, normalizeRevenueCurrency, parseMinorUnitAmount } from './money.js';
import { normalizeRevenueEvent } from './revenue-event.js';

const { Client, Pool } = pg;

const __dirname = path.resolve();
const DB_PATH = path.join(__dirname, 'db.json');

// PostgreSQL connection pool
let pgPool = null;
let pgClient = null;

/**
 * Multi-User Database Class
 * Supports both PostgreSQL (production) and JSON file (sandbox/dev)
 */
class Database {
  constructor() {
    const isSandbox = process.env.ENVIRONMENT === 'sandbox';
    this.isProduction = !isSandbox && (process.env.ENVIRONMENT === 'production' || process.env.ENVIRONMENT === 'staging' || Boolean(process.env.DATABASE_URL) || Boolean(process.env.HYPERDRIVE_CONNECTION_STRING));
    this.connected = false;

    if (isSandbox) {
      console.log('🧪 Sandbox mode: Using local db.json file');
    }

    if (this.isProduction) {
      this.ready = this.initPostgreSQL();
    } else {
      this.ready = Promise.resolve();
    }
  }

  async initPostgreSQL(options = {}) {
    try {
      const databaseUrl = options.connectionString ||
                          (options.env?.HYPERDRIVE && options.env.HYPERDRIVE.connectionString) ||
                          options.env?.DATABASE_URL ||
                          process.env.HYPERDRIVE_CONNECTION_STRING ||
                          process.env.DATABASE_URL;

      if (!databaseUrl) {
        if (process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production' || process.env.ENVIRONMENT === 'staging') {
          throw new Error('DATABASE_URL is required in production; JSON fallback is disabled');
        }
        console.log('📝 No DATABASE_URL found, falling back to JSON file');
        this.isProduction = false;
        return;
      }

      // Parse DATABASE_URL to extract connection details
      const dbUrl = new URL(databaseUrl);

      let sslConfig = databaseSsl(options.env || process.env);
      if (sslConfig !== false && (databaseUrl.includes('sslmode=require') || process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production')) {
        let caCert = (options.env && options.env.DATABASE_CA) || process.env.DATABASE_CA;

        // Decode Base64 if the cert doesn't start with -----BEGIN
        if (caCert && !caCert.startsWith('-----BEGIN')) {
          try {
            caCert = Buffer.from(caCert, 'base64').toString('utf-8');
          } catch {
            logWarn('database_ca_decode_failed');
          }
        }

        sslConfig = {
          rejectUnauthorized: Boolean(caCert),
          ca: caCert || undefined,
          servername: dbUrl.hostname,
        };
      }

      this.pgConfig = {
        user: decodeURIComponent(dbUrl.username),
        password: decodeURIComponent(dbUrl.password),
        host: dbUrl.hostname,
        port: parseInt(dbUrl.port, 10) || 5432,
        database: dbUrl.pathname.slice(1), // Remove leading '/'
        ssl: sslConfig,
      };

      pgClient = {
        query: async (text, params) => {
          const client = new Client(this.pgConfig);
          await client.connect();
          try {
            return await client.query(text, params);
          } finally {
            await client.end().catch(() => {});
          }
        },
        connect: async () => {
          const client = new Client(this.pgConfig);
          await client.connect();
          client.release = () => client.end().catch(() => {});
          return client;
        }
      };
      pgPool = pgClient;

      const testClient = await pgClient.connect();
      try {
        await testClient.query('SELECT 1');
      } finally {
        testClient.release();
      }

      this.connected = true;
      this.isProduction = true;
      console.log('🐘 Connected to PostgreSQL (Multi-User Mode)');

    } catch (error) {
      if (process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production' || process.env.ENVIRONMENT === 'staging') {
        throw error;
      }
      logWarn('database_postgres_connection_failed_using_json');
      this.isProduction = false;
      this.connected = false;
    }
  }

  async healthCheck() {
    await this.ready;
    if (this.isProduction) {
      if (!this.pgConfig) return { ok: false, storage: 'postgresql' };
      try {
        const client = await withTimeout(() => pgClient.connect(), 4000);
        try {
          await client.query('SELECT 1');
          this.connected = true;
          return { ok: true, storage: 'postgresql' };
        } finally {
          client.release();
        }
      } catch (err) {
        logWarn('database_health_check_failed', { message: err?.message });
        return { ok: false, storage: 'postgresql' };
      }
    }
    return { ok: true, storage: 'json' };
  }

  async close() {
    pgPool = null;
    pgClient = null;
    this.connected = false;
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
    } catch {
      logError('database_json_read_failed');
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
      revenueEvents: [],
      goals: [],
      goalSourceRules: [],
      goalContributions: [],
      goalMilestones: [],
      goalMilestoneTriggers: [],
      goalActionDeliveries: [],
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
      const isAdmin = isPlatformAdminEmail(userData.email);
      const displayName = userData.displayName || userData.username;

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
        logInfo('platform_administrator_access_granted');
      }

      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();

      const isAdmin = isPlatformAdminEmail(userData.email);
      const displayName = userData.displayName || userData.username;

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
        logInfo('platform_administrator_access_granted');
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
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        // Create workspace
        const workspaceResult = await client.query(`
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
        await client.query(`
          INSERT INTO workspace_settings (workspace_id)
          VALUES ($1)
        `, [workspace.id]);

        await client.query('COMMIT');
        return workspace;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
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
        providerConfiguredAt: null,
        obsConnectedAt: null,
        firstDonationAt: null,
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

  /**
   * Record the first time a workspace's OBS overlay connects (SSE), if not already recorded.
   * Idempotent: a second call after the first is a no-op.
   */
  async markWorkspaceObsConnected(workspaceId) {
    if (this.isProduction && this.connected) {
      await pgClient.query(
        'UPDATE workspace_settings SET obs_connected_at = NOW() WHERE workspace_id = $1 AND obs_connected_at IS NULL',
        [workspaceId]
      );
    } else {
      const data = await this.readJSON();
      const settingsIdx = data.workspaceSettings.findIndex(s => s.workspaceId === workspaceId);
      if (settingsIdx !== -1 && !data.workspaceSettings[settingsIdx].obsConnectedAt) {
        data.workspaceSettings[settingsIdx].obsConnectedAt = new Date().toISOString();
        await this.writeJSON(data);
      }
    }
  }

  /**
   * Record the first time a workspace has a complete ECPay configuration.
   * Idempotent so later credential rotation does not alter funnel timing.
   */
  async markWorkspaceProviderConfigured(workspaceId) {
    if (this.isProduction && this.connected) {
      await pgClient.query(
        'UPDATE workspace_settings SET provider_configured_at = NOW() WHERE workspace_id = $1 AND provider_configured_at IS NULL',
        [workspaceId]
      );
    } else {
      const data = await this.readJSON();
      const settingsIdx = data.workspaceSettings.findIndex(s => s.workspaceId === workspaceId);
      if (settingsIdx !== -1 && !data.workspaceSettings[settingsIdx].providerConfiguredAt) {
        data.workspaceSettings[settingsIdx].providerConfiguredAt = new Date().toISOString();
        await this.writeJSON(data);
      }
    }
  }

  /**
   * Record the first time a workspace receives a donation, if not already recorded.
   * Idempotent: a second call after the first is a no-op.
   */
  async markWorkspaceFirstDonation(workspaceId) {
    if (this.isProduction && this.connected) {
      await pgClient.query(
        'UPDATE workspace_settings SET first_donation_at = NOW() WHERE workspace_id = $1 AND first_donation_at IS NULL',
        [workspaceId]
      );
    } else {
      const data = await this.readJSON();
      const settingsIdx = data.workspaceSettings.findIndex(s => s.workspaceId === workspaceId);
      if (settingsIdx !== -1 && !data.workspaceSettings[settingsIdx].firstDonationAt) {
        data.workspaceSettings[settingsIdx].firstDonationAt = new Date().toISOString();
        await this.writeJSON(data);
      }
    }
  }

  // Aggregate activation timing for platform operations. Input records and output are
  // timestamp/count only; no workspace, creator, donor, credential, or payment fields.
  async getActivationFunnelMetrics() {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        SELECT u.created_at AS oauth_completed_at, w.created_at AS workspace_created_at,
               s.provider_configured_at, s.obs_connected_at, s.first_donation_at
        FROM user_workspaces w
        JOIN users u ON u.id = w.user_id
        JOIN workspace_settings s ON s.workspace_id = w.id
      `);
      return computeActivationFunnel(result.rows.map(row => this.camelCaseKeys(row)));
    }

    const data = await this.readJSON();
    const users = new Map(data.users.map(user => [user.id, user]));
    const settings = new Map(data.workspaceSettings.map(setting => [setting.workspaceId, setting]));
    return computeActivationFunnel(data.workspaces.map(workspace => {
      const setting = settings.get(workspace.id) || {};
      return {
        oauthCompletedAt: users.get(workspace.userId)?.createdAt || null,
        workspaceCreatedAt: workspace.createdAt || null,
        providerConfiguredAt: setting.providerConfiguredAt || null,
        obsConnectedAt: setting.obsConnectedAt || null,
        firstDonationAt: setting.firstDonationAt || null
      };
    }));
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
      // merchant_id/hash_key/hash_iv are stored as enc:v1: ciphertext (upsertPaymentProvider
      // always encrypts on write); this is the one read path used to sign real ECPay
      // requests, so decryption failures must propagate rather than send ciphertext to ECPay.
      return result.rows.length > 0 ? decryptProviderCredentials(this.camelCaseKeys(result.rows[0])) : null;
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
        encryptCredential(providerData.merchantId),
        encryptCredential(providerData.hashKey),
        encryptCredential(providerData.hashIV),
        providerData.isActive !== false
      ]);
      return decryptProviderCredentials(this.camelCaseKeys(result.rows[0]));
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

  /**
   * Whether the given ECPay MerchantID is already configured on some other
   * workspace. Informational only (drives an admin-panel warning), so a bad
   * legacy row is skipped rather than failing the whole check — unlike
   * getPaymentProvider, this never signs a real request with the result.
   *
   * Full-table scan: fine at current workspace counts, would need an indexed
   * lookup (e.g. a merchant-id hash column) if this product reaches a scale
   * where every payment_providers row must be decrypted on each settings load.
   */
  async isEcpayMerchantIdSharedWithOtherWorkspace(workspaceId, merchantId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        `SELECT workspace_id, merchant_id FROM payment_providers
         WHERE provider_name = 'ecpay' AND workspace_id != $1`,
        [workspaceId]
      );
      const others = [];
      for (const row of result.rows) {
        try {
          others.push({ workspaceId: row.workspace_id, merchantId: decryptCredential(row.merchant_id) });
        } catch (error) {
          logWarn('payment_provider_merchant_id_decrypt_failed_during_share_check', { workspaceId: row.workspace_id });
        }
      }
      return isMerchantIdSharedAcrossWorkspaces(others, merchantId);
    } else {
      const data = await this.readJSON();
      const others = data.paymentProviders
        .filter(p => p.providerName === 'ecpay' && p.workspaceId !== workspaceId)
        .map(p => ({ workspaceId: p.workspaceId, merchantId: p.merchantId }));
      return isMerchantIdSharedAcrossWorkspaces(others, merchantId);
    }
  }

  // =============================================
  // DONATION METHODS
  // =============================================

  /**
   * Add a new donation
   */
  async addDonation(workspaceId, donationData) {
    const amount = parseMinorUnitAmount(donationData.amount);
    const currency = normalizeCurrency(donationData.currency);
    if (!Number.isInteger(amount) || !currency) throw new Error('Invalid donation money');
    const payerName = String(donationData.payerName || '匿名').trim().slice(0, 80) || '匿名';
    const message = String(donationData.message || '').trim().slice(0, 300);
    if (this.isProduction && this.connected) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        // Check for duplicate
        const existing = await client.query(
          'SELECT id FROM donations WHERE workspace_id = $1 AND trade_no = $2',
          [workspaceId, donationData.tradeNo]
        );

        if (existing.rows.length > 0) {
          await client.query('ROLLBACK').catch(() => {});
          logInfo('donation_duplicate_ignored');
          return false;
        }

        // Insert donation
        await client.query(`
          INSERT INTO donations (
            workspace_id, payment_provider_id, trade_no, amount, currency,
            payer_name, message, status, completed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW())
        `, [
          workspaceId,
          donationData.paymentProviderId || null,
          donationData.tradeNo,
          amount,
          currency,
          payerName,
          message
        ]);

        // Update totals
        await client.query(`
          UPDATE workspace_settings
          SET total_amount = total_amount + $1,
              total_donations_count = total_donations_count + 1,
              updated_at = NOW()
          WHERE workspace_id = $2
        `, [amount, workspaceId]);

        await client.query('COMMIT');
        logInfo('donation_persisted');
        return true;

      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') { // Unique violation
          logInfo('donation_duplicate_ignored');
          return false;
        }
        throw error;
      } finally {
        client.release();
      }
    } else {
      const data = await this.readJSON();

      // Check for duplicate
      const existing = data.donations.find(
        d => d.workspaceId === workspaceId && d.tradeNo === donationData.tradeNo
      );
      if (existing) {
        logInfo('donation_duplicate_ignored');
        return false;
      }

      // Add donation
      data.donations.push({
        id: uuidv4(),
        workspaceId,
        paymentProviderId: donationData.paymentProviderId || null,
        tradeNo: donationData.tradeNo,
        amount,
        currency,
        payerName,
        message,
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
        data.workspaceSettings[settingsIdx].totalAmount += amount;
        data.workspaceSettings[settingsIdx].totalDonationsCount += 1;
        data.workspaceSettings[settingsIdx].updatedAt = new Date().toISOString();
      }

      await this.writeJSON(data);
      logInfo('donation_persisted');
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
   * Return every donation for one workspace. Intended only for an authenticated
   * workspace-owner export, never for a public or cross-tenant listing.
   */
  async getAllWorkspaceDonations(workspaceId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM donations WHERE workspace_id = $1 ORDER BY created_at ASC',
        [workspaceId]
      );
      return result.rows.map(row => this.camelCaseKeys(row));
    }
    const data = await this.readJSON();
    return data.donations
      .filter(donation => donation.workspaceId === workspaceId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
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
        // The overlay needs a stable opaque ID for alert deduplication, not the
        // provider transaction reference. This payload is visible to public clients.
        alertId: d.id,
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
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM donations WHERE workspace_id = $1', [workspaceId]);
        await client.query(`
          UPDATE workspace_settings
          SET total_amount = 0, total_donations_count = 0, goal_start_from = 0, updated_at = NOW()
          WHERE workspace_id = $1
        `, [workspaceId]);
        await client.query('COMMIT');
        logInfo('workspace_donations_cleared');
        return true;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
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
      logInfo('workspace_donations_cleared');
      return true;
    }
  }

  // =============================================
  // REVENUE EVENT METHODS (Universal Core)
  // =============================================

  /**
   * Add a normalized Revenue Event to persistent storage with source-aware idempotency.
   * @param {string} workspaceId
   * @param {Object} revenueEvent
   * @returns {Promise<{ success: boolean, duplicate: boolean, event: Object|null }>}
   */
  async addRevenueEvent(workspaceId, revenueEvent) {
    const ev = normalizeRevenueEvent({ ...revenueEvent, workspaceId });

    if (this.isProduction && this.connected) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        const result = await client.query(`
          INSERT INTO revenue_events (
            id, workspace_id, source, source_event_type, external_event_id,
            occurred_at, received_at, amount_minor, currency, quantity,
            tier, supporter_name, supporter_id, message, is_synthetic,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (workspace_id, source, external_event_id) WHERE external_event_id IS NOT NULL DO NOTHING
          RETURNING *
        `, [
          ev.id,
          workspaceId,
          ev.source,
          ev.sourceEventType,
          ev.externalEventId || null,
          ev.occurredAt,
          ev.receivedAt,
          ev.amount?.valueMinor ?? null,
          ev.amount?.currency ?? null,
          ev.quantity ?? null,
          ev.tier ?? null,
          ev.supporter?.displayName ?? null,
          ev.supporter?.externalUserId ?? null,
          ev.message || '',
          ev.isSynthetic,
          JSON.stringify(ev.metadata || {})
        ]);

        if (result.rows.length === 0) {
          await client.query('ROLLBACK').catch(() => {});
          const existing = await client.query(
            'SELECT * FROM revenue_events WHERE workspace_id = $1 AND source = $2 AND external_event_id = $3',
            [workspaceId, ev.source, ev.externalEventId]
          );
          logInfo('revenue_event_duplicate_ignored', { source: ev.source, externalEventId: ev.externalEventId });
          return { success: false, duplicate: true, event: existing.rows[0] ? this.camelCaseKeys(existing.rows[0]) : null };
        }

        await client.query('COMMIT');
        logInfo('revenue_event_persisted', { source: ev.source, sourceEventType: ev.sourceEventType });
        return { success: true, duplicate: false, event: this.camelCaseKeys(result.rows[0]) };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } else {
      const data = await this.readJSON();
      if (!data.revenueEvents) data.revenueEvents = [];

      if (ev.externalEventId) {
        const existing = data.revenueEvents.find(
          e => e.workspaceId === workspaceId && e.source === ev.source && e.externalEventId === ev.externalEventId
        );
        if (existing) {
          logInfo('revenue_event_duplicate_ignored', { source: ev.source, externalEventId: ev.externalEventId });
          return { success: false, duplicate: true, event: existing };
        }
      }

      const record = {
        id: ev.id,
        workspaceId,
        source: ev.source,
        sourceEventType: ev.sourceEventType,
        externalEventId: ev.externalEventId || null,
        occurredAt: ev.occurredAt,
        receivedAt: ev.receivedAt,
        amountMinor: ev.amount?.valueMinor ?? null,
        currency: ev.amount?.currency ?? null,
        quantity: ev.quantity ?? null,
        tier: ev.tier ?? null,
        supporterName: ev.supporter?.displayName ?? null,
        supporterId: ev.supporter?.externalUserId ?? null,
        message: ev.message || '',
        isSynthetic: ev.isSynthetic,
        metadata: ev.metadata || {},
        createdAt: new Date().toISOString()
      };

      data.revenueEvents.push(record);

      await this.writeJSON(data);
      logInfo('revenue_event_persisted', { source: ev.source, sourceEventType: ev.sourceEventType });
      return { success: true, duplicate: false, event: record };
    }
  }

  /**
   * Get revenue events for a workspace with filtering and pagination.
   */
  async getWorkspaceRevenueEvents(workspaceId, options = {}) {
    const { limit = 50, offset = 0, source = null, isSynthetic = null } = options;
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
    const safeOffset = Math.max(0, Number(offset) || 0);

    if (this.isProduction && this.connected) {
      const conditions = ['workspace_id = $1'];
      const values = [workspaceId];
      let paramCount = 2;

      if (source) {
        conditions.push(`source = $${paramCount++}`);
        values.push(String(source).toLowerCase());
      }
      if (isSynthetic !== null && isSynthetic !== undefined) {
        conditions.push(`is_synthetic = $${paramCount++}`);
        values.push(Boolean(isSynthetic));
      }

      values.push(safeLimit);
      const limitParam = `$${paramCount++}`;
      values.push(safeOffset);
      const offsetParam = `$${paramCount++}`;

      const query = `
        SELECT * FROM revenue_events
        WHERE ${conditions.join(' AND ')}
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      const result = await pgClient.query(query, values);
      return result.rows.map(row => this.camelCaseKeys(row));
    } else {
      const data = await this.readJSON();
      let events = data.revenueEvents || [];
      events = events.filter(e => e.workspaceId === workspaceId);

      if (source) {
        events = events.filter(e => e.source === String(source).toLowerCase());
      }
      if (isSynthetic !== null && isSynthetic !== undefined) {
        events = events.filter(e => Boolean(e.isSynthetic) === Boolean(isSynthetic));
      }

      return events
        .sort((a, b) => new Date(b.occurredAt || b.createdAt) - new Date(a.occurredAt || a.createdAt))
        .slice(safeOffset, safeOffset + safeLimit);
    }
  }

  /**
   * Get a single revenue event by ID.
   */
  async getWorkspaceRevenueEventById(workspaceId, eventId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM revenue_events WHERE workspace_id = $1 AND id = $2',
        [workspaceId, eventId]
      );
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return (data.revenueEvents || []).find(e => e.workspaceId === workspaceId && e.id === eventId) || null;
    }
  }

  /**
   * Get or generate the generic webhook token for a workspace.
   */
  async getGenericWebhookToken(workspaceId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT generic_webhook_token FROM user_workspaces WHERE id = $1',
        [workspaceId]
      );
      if (result.rows.length === 0) return null;
      if (result.rows[0].generic_webhook_token) {
        return result.rows[0].generic_webhook_token;
      }
      return await this.rotateGenericWebhookToken(workspaceId);
    } else {
      const data = await this.readJSON();
      const workspace = data.workspaces.find(w => w.id === workspaceId);
      if (!workspace) return null;
      if (workspace.genericWebhookToken) return workspace.genericWebhookToken;
      return await this.rotateGenericWebhookToken(workspaceId);
    }
  }

  /**
   * Rotate and return a new generic webhook token for a workspace.
   */
  async rotateGenericWebhookToken(workspaceId) {
    const newToken = 'whsec_' + crypto.randomBytes(32).toString('hex');
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'UPDATE user_workspaces SET generic_webhook_token = $1, updated_at = NOW() WHERE id = $2 RETURNING generic_webhook_token',
        [newToken, workspaceId]
      );
      return result.rows.length > 0 ? result.rows[0].generic_webhook_token : null;
    } else {
      const data = await this.readJSON();
      const workspace = data.workspaces.find(w => w.id === workspaceId);
      if (!workspace) return null;
      workspace.genericWebhookToken = newToken;
      workspace.updatedAt = new Date().toISOString();
      await this.writeJSON(data);
      return newToken;
    }
  }

  /**
   * Find workspace by its generic webhook token.
   */
  async findWorkspaceByGenericWebhookToken(token) {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.trim();
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM user_workspaces WHERE generic_webhook_token = $1',
        [cleanToken]
      );
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return data.workspaces.find(w => w.genericWebhookToken === cleanToken) || null;
    }
  }

  // =============================================
  // GOAL ENGINE METHODS (Stage 3)
  // =============================================

  /**
   * Create a new Goal for a workspace. Auto-seeds default rules and milestones.
   */
  async createGoal(workspaceId, goalData = {}) {
    const title = String(goalData.title || '').trim().slice(0, 200);
    if (!title) throw new Error('Goal title is required');

    const targetMinor = parseMinorUnitAmount(goalData.targetMinor, { minimum: 1 });
    if (!Number.isSafeInteger(targetMinor) || targetMinor <= 0) {
      throw new Error('Goal target amount must be a positive integer minor unit');
    }

    const displayCurrency = normalizeRevenueCurrency(goalData.displayCurrency, 'TWD');
    if (!displayCurrency) throw new Error('Invalid goal display currency');

    const startingAmountMinor = goalData.startingAmountMinor !== undefined && goalData.startingAmountMinor !== null
      ? parseMinorUnitAmount(goalData.startingAmountMinor, { minimum: 0 })
      : 0;
    if (!Number.isSafeInteger(startingAmountMinor) || startingAmountMinor < 0) {
      throw new Error('Invalid starting amount minor units');
    }

    const goalId = uuidv4();
    const description = goalData.description ? String(goalData.description).trim().slice(0, 1000) : null;
    const nextGoalId = goalData.nextGoalId || null;
    const metadata = goalData.metadata || {};
    const startsAt = goalData.startsAt || null;
    const endsAt = goalData.endsAt || null;
    const isActive = Boolean(goalData.isActive);

    const defaultSources = ['ecpay', 'webhook', 'manual', 'test'];
    const defaultMilestonePercents = [25, 50, 75, 100];

    if (this.isProduction && this.connected) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        if (isActive) {
          await client.query('UPDATE goals SET is_active = FALSE WHERE workspace_id = $1', [workspaceId]);
        }

        const result = await client.query(`
          INSERT INTO goals (
            id, workspace_id, title, description, target_minor, display_currency,
            starting_amount_minor, current_amount_minor, status, is_active,
            epoch, starts_at, ends_at, activated_at, next_goal_id, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $12, $13, $14, $15)
          RETURNING *
        `, [
          goalId,
          workspaceId,
          title,
          description,
          targetMinor,
          displayCurrency,
          startingAmountMinor,
          startingAmountMinor,
          isActive ? 'active' : 'draft',
          isActive,
          startsAt,
          endsAt,
          isActive ? new Date() : null,
          nextGoalId,
          JSON.stringify(metadata)
        ]);

        const goal = this.camelCaseKeys(result.rows[0]);

        // Seed default source rules
        for (const src of defaultSources) {
          await client.query(`
            INSERT INTO goal_source_rules (goal_id, workspace_id, source, enabled, rule_type, config)
            VALUES ($1, $2, $3, TRUE, 'monetary_passthrough', '{}')
            ON CONFLICT (goal_id, source) DO NOTHING
          `, [goalId, workspaceId, src]);
        }

        // Seed default milestones
        for (const pct of defaultMilestonePercents) {
          await client.query(`
            INSERT INTO goal_milestones (goal_id, workspace_id, threshold_percent, label, enabled, visual_action, sound_action)
            VALUES ($1, $2, $3, $4, TRUE, TRUE, TRUE)
            ON CONFLICT (goal_id, threshold_percent) DO NOTHING
          `, [goalId, workspaceId, pct, `${pct}% Milestone`]);
        }

        await client.query('COMMIT');
        logInfo('goal_created', { goal_id: goalId, workspace_id: workspaceId, title });
        return goal;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } else {
      const data = await this.readJSON();
      if (!data.goals) data.goals = [];
      if (!data.goalSourceRules) data.goalSourceRules = [];
      if (!data.goalMilestones) data.goalMilestones = [];

      if (isActive) {
        data.goals.forEach(g => {
          if (g.workspaceId === workspaceId) g.isActive = false;
        });
      }

      const newGoal = {
        id: goalId,
        workspaceId,
        title,
        description,
        targetMinor,
        displayCurrency,
        startingAmountMinor,
        currentAmountMinor: startingAmountMinor,
        status: isActive ? 'active' : 'draft',
        isActive,
        epoch: 1,
        startsAt,
        endsAt,
        activatedAt: isActive ? new Date().toISOString() : null,
        completedAt: null,
        nextGoalId,
        orderIndex: data.goals.filter(g => g.workspaceId === workspaceId).length,
        metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      data.goals.push(newGoal);

      for (const src of defaultSources) {
        data.goalSourceRules.push({
          id: uuidv4(),
          goalId,
          workspaceId,
          source: src,
          enabled: true,
          ruleType: 'monetary_passthrough',
          config: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      for (const pct of defaultMilestonePercents) {
        data.goalMilestones.push({
          id: uuidv4(),
          goalId,
          workspaceId,
          thresholdPercent: pct,
          label: `${pct}% Milestone`,
          enabled: true,
          visualAction: true,
          soundAction: true,
          webhookActionUrl: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      await this.writeJSON(data);
      logInfo('goal_created', { goal_id: goalId, workspace_id: workspaceId, title });
      return newGoal;
    }
  }

  /**
   * Get all goals for a workspace.
   */
  async getWorkspaceGoals(workspaceId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM goals WHERE workspace_id = $1 ORDER BY order_index ASC, created_at DESC',
        [workspaceId]
      );
      return result.rows.map(r => this.camelCaseKeys(r));
    } else {
      const data = await this.readJSON();
      return (data.goals || [])
        .filter(g => g.workspaceId === workspaceId)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || new Date(b.createdAt) - new Date(a.createdAt));
    }
  }

  /**
   * Get a goal by ID and workspaceId.
   */
  async getGoalById(workspaceId, goalId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM goals WHERE workspace_id = $1 AND id = $2',
        [workspaceId, goalId]
      );
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return (data.goals || []).find(g => g.workspaceId === workspaceId && g.id === goalId) || null;
    }
  }

  /**
   * Get the active goal for a workspace.
   */
  async getActiveGoal(workspaceId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM goals WHERE workspace_id = $1 AND is_active = TRUE LIMIT 1',
        [workspaceId]
      );
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      return (data.goals || []).find(g => g.workspaceId === workspaceId && g.isActive === true) || null;
    }
  }

  /**
   * Update goal details.
   */
  async updateGoal(workspaceId, goalId, updateData = {}) {
    if (this.isProduction && this.connected) {
      const fields = [];
      const values = [workspaceId, goalId];
      let paramCount = 3;

      if (updateData.title !== undefined) {
        fields.push(`title = $${paramCount++}`);
        values.push(String(updateData.title).trim().slice(0, 200));
      }
      if (updateData.description !== undefined) {
        fields.push(`description = $${paramCount++}`);
        values.push(updateData.description ? String(updateData.description).trim().slice(0, 1000) : null);
      }
      if (updateData.targetMinor !== undefined) {
        const targetMinor = parseMinorUnitAmount(updateData.targetMinor, { minimum: 1 });
        if (!Number.isSafeInteger(targetMinor) || targetMinor <= 0) throw new Error('Invalid targetMinor');
        fields.push(`target_minor = $${paramCount++}`);
        values.push(targetMinor);
      }
      if (updateData.displayCurrency !== undefined) {
        const displayCurrency = normalizeRevenueCurrency(updateData.displayCurrency);
        if (!displayCurrency) throw new Error('Invalid displayCurrency');
        fields.push(`display_currency = $${paramCount++}`);
        values.push(displayCurrency);
      }
      if (updateData.startingAmountMinor !== undefined) {
        const startingAmountMinor = parseMinorUnitAmount(updateData.startingAmountMinor, { minimum: 0 });
        if (!Number.isSafeInteger(startingAmountMinor) || startingAmountMinor < 0) throw new Error('Invalid startingAmountMinor');
        fields.push(`starting_amount_minor = $${paramCount++}`);
        values.push(startingAmountMinor);
      }
      if (updateData.nextGoalId !== undefined) {
        fields.push(`next_goal_id = $${paramCount++}`);
        values.push(updateData.nextGoalId || null);
      }
      if (updateData.metadata !== undefined) {
        fields.push(`metadata = $${paramCount++}`);
        values.push(JSON.stringify(updateData.metadata || {}));
      }

      if (fields.length === 0) return await this.getGoalById(workspaceId, goalId);

      fields.push(`updated_at = NOW()`);
      const query = `
        UPDATE goals SET ${fields.join(', ')}
        WHERE workspace_id = $1 AND id = $2
        RETURNING *
      `;
      const result = await pgClient.query(query, values);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      const goal = (data.goals || []).find(g => g.workspaceId === workspaceId && g.id === goalId);
      if (!goal) return null;

      if (updateData.title !== undefined) goal.title = String(updateData.title).trim().slice(0, 200);
      if (updateData.description !== undefined) goal.description = updateData.description ? String(updateData.description).trim().slice(0, 1000) : null;
      if (updateData.targetMinor !== undefined) {
        const targetMinor = parseMinorUnitAmount(updateData.targetMinor, { minimum: 1 });
        if (!Number.isSafeInteger(targetMinor) || targetMinor <= 0) throw new Error('Invalid targetMinor');
        goal.targetMinor = targetMinor;
      }
      if (updateData.displayCurrency !== undefined) {
        const displayCurrency = normalizeRevenueCurrency(updateData.displayCurrency);
        if (!displayCurrency) throw new Error('Invalid displayCurrency');
        goal.displayCurrency = displayCurrency;
      }
      if (updateData.startingAmountMinor !== undefined) {
        const startingAmountMinor = parseMinorUnitAmount(updateData.startingAmountMinor, { minimum: 0 });
        if (!Number.isSafeInteger(startingAmountMinor) || startingAmountMinor < 0) throw new Error('Invalid startingAmountMinor');
        goal.startingAmountMinor = startingAmountMinor;
      }
      if (updateData.nextGoalId !== undefined) goal.nextGoalId = updateData.nextGoalId || null;
      if (updateData.metadata !== undefined) goal.metadata = updateData.metadata || {};
      goal.updatedAt = new Date().toISOString();

      await this.writeJSON(data);
      return goal;
    }
  }

  /**
   * Activate a goal (deactivates any other active goal in workspace).
   */
  async activateGoal(workspaceId, goalId) {
    if (this.isProduction && this.connected) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE goals SET is_active = FALSE WHERE workspace_id = $1', [workspaceId]);
        const result = await client.query(`
          UPDATE goals
          SET is_active = TRUE, status = 'active', activated_at = COALESCE(activated_at, NOW()), updated_at = NOW()
          WHERE workspace_id = $1 AND id = $2
          RETURNING *
        `, [workspaceId, goalId]);

        await client.query('COMMIT');
        logInfo('goal_activated', { goal_id: goalId, workspace_id: workspaceId });
        return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } else {
      const data = await this.readJSON();
      let target = null;
      (data.goals || []).forEach(g => {
        if (g.workspaceId === workspaceId) {
          if (g.id === goalId) {
            g.isActive = true;
            g.status = 'active';
            g.activatedAt = g.activatedAt || new Date().toISOString();
            g.updatedAt = new Date().toISOString();
            target = g;
          } else {
            g.isActive = false;
          }
        }
      });
      await this.writeJSON(data);
      if (target) logInfo('goal_activated', { goal_id: goalId, workspace_id: workspaceId });
      return target;
    }
  }

  /**
   * Deactivate a goal.
   */
  async deactivateGoal(workspaceId, goalId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        UPDATE goals SET is_active = FALSE, updated_at = NOW()
        WHERE workspace_id = $1 AND id = $2
        RETURNING *
      `, [workspaceId, goalId]);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      const goal = (data.goals || []).find(g => g.workspaceId === workspaceId && g.id === goalId);
      if (goal) {
        goal.isActive = false;
        goal.updatedAt = new Date().toISOString();
        await this.writeJSON(data);
      }
      return goal;
    }
  }

  /**
   * Reset a goal's progress safely by incrementing epoch.
   * Preserves historical contributions and previous milestone audit trail.
   */
  async resetGoalProgress(workspaceId, goalId) {
    if (this.isProduction && this.connected) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(`
          UPDATE goals
          SET epoch = epoch + 1,
              current_amount_minor = starting_amount_minor,
              status = 'active',
              completed_at = NULL,
              updated_at = NOW()
          WHERE workspace_id = $1 AND id = $2
          RETURNING *
        `, [workspaceId, goalId]);

        await client.query('COMMIT');
        logInfo('goal_reset', { goal_id: goalId, workspace_id: workspaceId, new_epoch: result.rows[0]?.epoch });
        return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } else {
      const data = await this.readJSON();
      const goal = (data.goals || []).find(g => g.workspaceId === workspaceId && g.id === goalId);
      if (goal) {
        goal.epoch = (goal.epoch || 1) + 1;
        goal.currentAmountMinor = goal.startingAmountMinor || 0;
        goal.status = 'active';
        goal.completedAt = null;
        goal.updatedAt = new Date().toISOString();
        await this.writeJSON(data);
        logInfo('goal_reset', { goal_id: goalId, workspace_id: workspaceId, new_epoch: goal.epoch });
      }
      return goal;
    }
  }

  /**
   * Get source rules configured for a goal.
   */
  async getGoalRules(goalId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM goal_source_rules WHERE goal_id = $1 ORDER BY source ASC',
        [goalId]
      );
      return result.rows.map(r => this.camelCaseKeys(r));
    } else {
      const data = await this.readJSON();
      return (data.goalSourceRules || []).filter(r => r.goalId === goalId);
    }
  }

  /**
   * Create or update a source rule for a goal.
   */
  async upsertGoalRule(workspaceId, goalId, ruleData = {}) {
    const source = String(ruleData.source || '').trim().toLowerCase();
    if (!source) throw new Error('Source name is required');
    const enabled = Boolean(ruleData.enabled !== false);
    const ruleType = String(ruleData.ruleType || 'monetary_passthrough').trim().toLowerCase();
    const config = ruleData.config || {};

    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        INSERT INTO goal_source_rules (goal_id, workspace_id, source, enabled, rule_type, config)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (goal_id, source)
        DO UPDATE SET enabled = $4, rule_type = $5, config = $6, updated_at = NOW()
        RETURNING *
      `, [goalId, workspaceId, source, enabled, ruleType, JSON.stringify(config)]);
      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();
      if (!data.goalSourceRules) data.goalSourceRules = [];
      let rule = data.goalSourceRules.find(r => r.goalId === goalId && r.source === source);
      if (rule) {
        rule.enabled = enabled;
        rule.ruleType = ruleType;
        rule.config = config;
        rule.updatedAt = new Date().toISOString();
      } else {
        rule = {
          id: uuidv4(),
          goalId,
          workspaceId,
          source,
          enabled,
          ruleType,
          config,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        data.goalSourceRules.push(rule);
      }
      await this.writeJSON(data);
      return rule;
    }
  }

  /**
   * Get configured milestones for a goal.
   */
  async getGoalMilestones(goalId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM goal_milestones WHERE goal_id = $1 ORDER BY threshold_percent ASC',
        [goalId]
      );
      return result.rows.map(r => this.camelCaseKeys(r));
    } else {
      const data = await this.readJSON();
      return (data.goalMilestones || [])
        .filter(m => m.goalId === goalId)
        .sort((a, b) => a.thresholdPercent - b.thresholdPercent);
    }
  }

  /**
   * Create or update a milestone for a goal.
   */
  async upsertGoalMilestone(workspaceId, goalId, milestoneData = {}) {
    const thresholdPercent = parseInt(milestoneData.thresholdPercent, 10);
    if (!Number.isInteger(thresholdPercent) || thresholdPercent < 1 || thresholdPercent > 100) {
      throw new Error('Threshold percent must be an integer between 1 and 100');
    }
    const label = milestoneData.label ? String(milestoneData.label).trim().slice(0, 100) : `${thresholdPercent}% Milestone`;
    const enabled = Boolean(milestoneData.enabled !== false);
    const visualAction = Boolean(milestoneData.visualAction !== false);
    const soundAction = Boolean(milestoneData.soundAction !== false);
    const webhookActionUrl = milestoneData.webhookActionUrl ? String(milestoneData.webhookActionUrl).trim().slice(0, 500) : null;

    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        INSERT INTO goal_milestones (goal_id, workspace_id, threshold_percent, label, enabled, visual_action, sound_action, webhook_action_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (goal_id, threshold_percent)
        DO UPDATE SET label = $4, enabled = $5, visual_action = $6, sound_action = $7, webhook_action_url = $8, updated_at = NOW()
        RETURNING *
      `, [goalId, workspaceId, thresholdPercent, label, enabled, visualAction, soundAction, webhookActionUrl]);
      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();
      if (!data.goalMilestones) data.goalMilestones = [];
      let milestone = data.goalMilestones.find(m => m.goalId === goalId && m.thresholdPercent === thresholdPercent);
      if (milestone) {
        milestone.label = label;
        milestone.enabled = enabled;
        milestone.visualAction = visualAction;
        milestone.soundAction = soundAction;
        milestone.webhookActionUrl = webhookActionUrl;
        milestone.updatedAt = new Date().toISOString();
      } else {
        milestone = {
          id: uuidv4(),
          goalId,
          workspaceId,
          thresholdPercent,
          label,
          enabled,
          visualAction,
          soundAction,
          webhookActionUrl,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        data.goalMilestones.push(milestone);
      }
      await this.writeJSON(data);
      return milestone;
    }
  }

  /**
   * Add a Goal Contribution idempotently and update Goal's current_amount_minor atomically.
   */
  async addGoalContribution(workspaceId, contributionData = {}) {
    const goalId = contributionData.goalId;
    const contributionMinor = parseMinorUnitAmount(contributionData.contributionMinor, { minimum: 0 });
    if (!Number.isSafeInteger(contributionMinor) || contributionMinor < 0) {
      throw new Error('Invalid contributionMinor');
    }

    if (this.isProduction && this.connected) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        // Lock the goal row for concurrency safety
        const goalResult = await client.query(
          'SELECT * FROM goals WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
          [goalId, workspaceId]
        );
        if (goalResult.rows.length === 0) {
          await client.query('ROLLBACK').catch(() => {});
          return { success: false, duplicate: false, error: 'Goal not found' };
        }
        const goalRow = goalResult.rows[0];

        // Insert contribution with idempotency check on (goal_id, revenue_event_id)
        const contribId = contributionData.id || uuidv4();
        const insertResult = await client.query(`
          INSERT INTO goal_contributions (
            id, goal_id, workspace_id, revenue_event_id, epoch, source,
            source_event_type, source_amount_minor, source_currency, source_quantity,
            source_tier, rule_type, fx_rate, fx_rate_provenance, contribution_minor,
            currency, supporter_name, message, is_synthetic, reason, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          ON CONFLICT (goal_id, revenue_event_id) WHERE revenue_event_id IS NOT NULL DO NOTHING
          RETURNING *
        `, [
          contribId,
          goalId,
          workspaceId,
          contributionData.revenueEventId || null,
          goalRow.epoch || 1,
          contributionData.source,
          contributionData.sourceEventType,
          contributionData.sourceAmountMinor ?? null,
          contributionData.sourceCurrency ?? null,
          contributionData.sourceQuantity ?? null,
          contributionData.sourceTier ?? null,
          contributionData.ruleType,
          contributionData.fxRate ?? 1.0,
          contributionData.fxRateProvenance ?? 'same_currency',
          contributionMinor,
          goalRow.display_currency,
          contributionData.supporterName || null,
          contributionData.message || null,
          Boolean(contributionData.isSynthetic),
          contributionData.reason || null,
          JSON.stringify(contributionData.metadata || {})
        ]);

        if (insertResult.rows.length === 0) {
          await client.query('ROLLBACK').catch(() => {});
          const existing = await client.query(
            'SELECT * FROM goal_contributions WHERE goal_id = $1 AND revenue_event_id = $2',
            [goalId, contributionData.revenueEventId]
          );
          logInfo('contribution_duplicate', { goal_id: goalId, revenue_event_id: contributionData.revenueEventId });
          return {
            success: false,
            duplicate: true,
            contribution: existing.rows[0] ? this.camelCaseKeys(existing.rows[0]) : null
          };
        }

        const prevAmountMinor = Number(goalRow.current_amount_minor);
        const newAmountMinor = prevAmountMinor + contributionMinor;
        const targetMinor = Number(goalRow.target_minor);
        const isCompleted = newAmountMinor >= targetMinor;

        const updateGoalResult = await client.query(`
          UPDATE goals
          SET current_amount_minor = $1,
              status = CASE WHEN $2 = TRUE AND status != 'completed' THEN 'completed' ELSE status END,
              completed_at = CASE WHEN $2 = TRUE AND completed_at IS NULL THEN NOW() ELSE completed_at END,
              updated_at = NOW()
          WHERE id = $3
          RETURNING *
        `, [newAmountMinor, isCompleted, goalId]);

        await client.query('COMMIT');

        logInfo('contribution_created', {
          goal_id: goalId,
          source: contributionData.source,
          contributionMinor,
          newAmountMinor
        });

        return {
          success: true,
          duplicate: false,
          contribution: this.camelCaseKeys(insertResult.rows[0]),
          previousAmountMinor: prevAmountMinor,
          newAmountMinor,
          goal: this.camelCaseKeys(updateGoalResult.rows[0])
        };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } else {
      const data = await this.readJSON();
      if (!data.goalContributions) data.goalContributions = [];

      const goal = (data.goals || []).find(g => g.id === goalId && g.workspaceId === workspaceId);
      if (!goal) return { success: false, duplicate: false, error: 'Goal not found' };

      if (contributionData.revenueEventId) {
        const existing = data.goalContributions.find(
          c => c.goalId === goalId && c.revenueEventId === contributionData.revenueEventId
        );
        if (existing) {
          logInfo('contribution_duplicate', { goal_id: goalId, revenue_event_id: contributionData.revenueEventId });
          return { success: false, duplicate: true, contribution: existing };
        }
      }

      const contrib = {
        id: contributionData.id || uuidv4(),
        goalId,
        workspaceId,
        revenueEventId: contributionData.revenueEventId || null,
        epoch: goal.epoch || 1,
        source: contributionData.source,
        sourceEventType: contributionData.sourceEventType,
        sourceAmountMinor: contributionData.sourceAmountMinor ?? null,
        sourceCurrency: contributionData.sourceCurrency ?? null,
        sourceQuantity: contributionData.sourceQuantity ?? null,
        sourceTier: contributionData.sourceTier ?? null,
        ruleType: contributionData.ruleType,
        fxRate: contributionData.fxRate ?? 1.0,
        fxRateProvenance: contributionData.fxRateProvenance ?? 'same_currency',
        contributionMinor,
        currency: goal.displayCurrency,
        supporterName: contributionData.supporterName || null,
        message: contributionData.message || null,
        isSynthetic: Boolean(contributionData.isSynthetic),
        reason: contributionData.reason || null,
        metadata: contributionData.metadata || {},
        createdAt: new Date().toISOString()
      };

      data.goalContributions.push(contrib);

      const prevAmountMinor = goal.currentAmountMinor || 0;
      const newAmountMinor = prevAmountMinor + contributionMinor;
      goal.currentAmountMinor = newAmountMinor;

      if (newAmountMinor >= goal.targetMinor && goal.status !== 'completed') {
        goal.status = 'completed';
        goal.completedAt = goal.completedAt || new Date().toISOString();
      }
      goal.updatedAt = new Date().toISOString();

      await this.writeJSON(data);

      logInfo('contribution_created', {
        goal_id: goalId,
        source: contributionData.source,
        contributionMinor,
        newAmountMinor
      });

      return {
        success: true,
        duplicate: false,
        contribution: contrib,
        previousAmountMinor: prevAmountMinor,
        newAmountMinor,
        goal
      };
    }
  }

  /**
   * Add a manual adjustment to a goal (positive or negative).
   */
  async addGoalAdjustment(workspaceId, goalId, adjustmentData = {}) {
    const adjustmentMinor = Number(adjustmentData.amountMinor);
    if (!Number.isSafeInteger(adjustmentMinor) || adjustmentMinor === 0) {
      throw new Error('Adjustment amount must be a non-zero integer minor unit');
    }
    const reason = String(adjustmentData.reason || '').trim().slice(0, 300);
    if (!reason) {
      throw new Error('A reason or note is required for manual adjustments');
    }

    if (this.isProduction && this.connected) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const goalResult = await client.query(
          'SELECT * FROM goals WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
          [goalId, workspaceId]
        );
        if (goalResult.rows.length === 0) {
          await client.query('ROLLBACK').catch(() => {});
          throw new Error('Goal not found');
        }
        const goalRow = goalResult.rows[0];

        const contribId = uuidv4();
        const insertContrib = await client.query(`
          INSERT INTO goal_contributions (
            id, goal_id, workspace_id, epoch, source, source_event_type,
            rule_type, fx_rate, fx_rate_provenance, contribution_minor,
            currency, is_synthetic, reason, metadata
          )
          VALUES ($1, $2, $3, $4, 'manual', 'manual_adjustment', 'manual_adjustment', 1.0, 'same_currency', $5, $6, TRUE, $7, $8)
          RETURNING *
        `, [
          contribId,
          goalId,
          workspaceId,
          goalRow.epoch || 1,
          adjustmentMinor,
          goalRow.display_currency,
          reason,
          JSON.stringify(adjustmentData.metadata || {})
        ]);

        const prevAmountMinor = Number(goalRow.current_amount_minor);
        const newAmountMinor = Math.max(0, prevAmountMinor + adjustmentMinor);
        const isCompleted = newAmountMinor >= Number(goalRow.target_minor);

        const updateGoal = await client.query(`
          UPDATE goals
          SET current_amount_minor = $1,
              status = CASE WHEN $2 = TRUE AND status != 'completed' THEN 'completed' ELSE status END,
              completed_at = CASE WHEN $2 = TRUE AND completed_at IS NULL THEN NOW() ELSE completed_at END,
              updated_at = NOW()
          WHERE id = $3
          RETURNING *
        `, [newAmountMinor, isCompleted, goalId]);

        await client.query('COMMIT');
        logInfo('goal_adjusted', { goal_id: goalId, workspace_id: workspaceId, adjustmentMinor, newAmountMinor, reason });

        return {
          success: true,
          contribution: this.camelCaseKeys(insertContrib.rows[0]),
          previousAmountMinor: prevAmountMinor,
          newAmountMinor,
          goal: this.camelCaseKeys(updateGoal.rows[0])
        };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } else {
      const data = await this.readJSON();
      if (!data.goalContributions) data.goalContributions = [];

      const goal = (data.goals || []).find(g => g.id === goalId && g.workspaceId === workspaceId);
      if (!goal) throw new Error('Goal not found');

      const contrib = {
        id: uuidv4(),
        goalId,
        workspaceId,
        revenueEventId: null,
        epoch: goal.epoch || 1,
        source: 'manual',
        sourceEventType: 'manual_adjustment',
        ruleType: 'manual_adjustment',
        fxRate: 1.0,
        fxRateProvenance: 'same_currency',
        contributionMinor: adjustmentMinor,
        currency: goal.displayCurrency,
        isSynthetic: true,
        reason,
        metadata: adjustmentData.metadata || {},
        createdAt: new Date().toISOString()
      };

      data.goalContributions.push(contrib);

      const prevAmountMinor = goal.currentAmountMinor || 0;
      const newAmountMinor = Math.max(0, prevAmountMinor + adjustmentMinor);
      goal.currentAmountMinor = newAmountMinor;

      if (newAmountMinor >= goal.targetMinor && goal.status !== 'completed') {
        goal.status = 'completed';
        goal.completedAt = goal.completedAt || new Date().toISOString();
      }
      goal.updatedAt = new Date().toISOString();

      await this.writeJSON(data);
      logInfo('goal_adjusted', { goal_id: goalId, workspace_id: workspaceId, adjustmentMinor, newAmountMinor, reason });

      return {
        success: true,
        contribution: contrib,
        previousAmountMinor: prevAmountMinor,
        newAmountMinor,
        goal
      };
    }
  }

  /**
   * Get paginated contributions for a goal.
   */
  async getGoalContributions(goalId, options = {}) {
    const { limit = 50, offset = 0, epoch = null } = options;
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
    const safeOffset = Math.max(0, Number(offset) || 0);

    if (this.isProduction && this.connected) {
      const conditions = ['goal_id = $1'];
      const values = [goalId];
      let paramCount = 2;

      if (epoch !== null && epoch !== undefined) {
        conditions.push(`epoch = $${paramCount++}`);
        values.push(parseInt(epoch, 10));
      }

      values.push(safeLimit);
      const limitParam = `$${paramCount++}`;
      values.push(safeOffset);
      const offsetParam = `$${paramCount++}`;

      const query = `
        SELECT * FROM goal_contributions
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;
      const result = await pgClient.query(query, values);
      return result.rows.map(r => this.camelCaseKeys(r));
    } else {
      const data = await this.readJSON();
      let list = (data.goalContributions || []).filter(c => c.goalId === goalId);
      if (epoch !== null && epoch !== undefined) {
        list = list.filter(c => c.epoch === parseInt(epoch, 10));
      }
      return list
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(safeOffset, safeOffset + safeLimit);
    }
  }

  /**
   * Record a milestone trigger state (exactly once per epoch).
   */
  async recordMilestoneTrigger(workspaceId, goalId, milestoneId, thresholdPercent, epoch, contributionId = null) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        INSERT INTO goal_milestone_triggers (
          id, goal_id, milestone_id, workspace_id, epoch, threshold_percent, triggered_by_contribution_id
        )
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
        ON CONFLICT (goal_id, epoch, threshold_percent) DO NOTHING
        RETURNING *
      `, [goalId, milestoneId, workspaceId, epoch, thresholdPercent, contributionId]);

      const triggered = result.rows.length > 0;
      if (triggered) {
        logInfo('milestone_triggered', { goal_id: goalId, epoch, thresholdPercent });
      }
      return {
        triggered,
        triggerRecord: triggered ? this.camelCaseKeys(result.rows[0]) : null
      };
    } else {
      const data = await this.readJSON();
      if (!data.goalMilestoneTriggers) data.goalMilestoneTriggers = [];

      const existing = data.goalMilestoneTriggers.find(
        t => t.goalId === goalId && t.epoch === epoch && t.thresholdPercent === thresholdPercent
      );

      if (existing) {
        return { triggered: false, triggerRecord: existing };
      }

      const triggerRecord = {
        id: uuidv4(),
        goalId,
        milestoneId,
        workspaceId,
        epoch,
        thresholdPercent,
        triggeredByContributionId: contributionId,
        triggeredAt: new Date().toISOString()
      };

      data.goalMilestoneTriggers.push(triggerRecord);
      await this.writeJSON(data);
      logInfo('milestone_triggered', { goal_id: goalId, epoch, thresholdPercent });
      return { triggered: true, triggerRecord };
    }
  }

  /**
   * Get milestone triggers for a goal.
   */
  async getGoalMilestoneTriggers(goalId, epoch = null) {
    if (this.isProduction && this.connected) {
      let query = 'SELECT * FROM goal_milestone_triggers WHERE goal_id = $1';
      const params = [goalId];
      if (epoch !== null && epoch !== undefined) {
        query += ' AND epoch = $2';
        params.push(parseInt(epoch, 10));
      }
      query += ' ORDER BY threshold_percent ASC';
      const result = await pgClient.query(query, params);
      return result.rows.map(r => this.camelCaseKeys(r));
    } else {
      const data = await this.readJSON();
      let list = (data.goalMilestoneTriggers || []).filter(t => t.goalId === goalId);
      if (epoch !== null && epoch !== undefined) {
        list = list.filter(t => t.epoch === parseInt(epoch, 10));
      }
      return list.sort((a, b) => a.thresholdPercent - b.thresholdPercent);
    }
  }

  /**
   * Record delivery outcome of an action (webhook, sound, visual).
   */
  async recordActionDelivery(workspaceId, goalId, triggerId, deliveryData = {}) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        INSERT INTO goal_action_deliveries (
          id, workspace_id, goal_id, milestone_trigger_id, action_type, target_url, status, http_status, error_message, delivered_at
        )
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        workspaceId,
        goalId,
        triggerId,
        deliveryData.actionType,
        deliveryData.targetUrl || null,
        deliveryData.status || 'pending',
        deliveryData.httpStatus || null,
        deliveryData.errorMessage || null,
        deliveryData.status === 'delivered' ? new Date() : null
      ]);
      return this.camelCaseKeys(result.rows[0]);
    } else {
      const data = await this.readJSON();
      if (!data.goalActionDeliveries) data.goalActionDeliveries = [];
      const record = {
        id: uuidv4(),
        workspaceId,
        goalId,
        milestoneTriggerId: triggerId,
        actionType: deliveryData.actionType,
        targetUrl: deliveryData.targetUrl || null,
        status: deliveryData.status || 'pending',
        httpStatus: deliveryData.httpStatus || null,
        errorMessage: deliveryData.errorMessage || null,
        deliveredAt: deliveryData.status === 'delivered' ? new Date().toISOString() : null,
        createdAt: new Date().toISOString()
      };
      data.goalActionDeliveries.push(record);
      await this.writeJSON(data);
      return record;
    }
  }

  /**
   * Update action delivery state (e.g. pending -> delivered / failed).
   */
  async updateActionDelivery(workspaceId, deliveryId, updateData = {}) {
    const status = updateData.status || 'failed';
    const httpStatus = updateData.httpStatus || null;
    const errorMessage = updateData.errorMessage || null;

    if (this.isProduction && this.connected) {
      const result = await pgClient.query(`
        UPDATE goal_action_deliveries
        SET status = $1, http_status = $2, error_message = $3,
            delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END
        WHERE workspace_id = $4 AND id = $5
        RETURNING *
      `, [status, httpStatus, errorMessage, workspaceId, deliveryId]);
      return result.rows.length > 0 ? this.camelCaseKeys(result.rows[0]) : null;
    } else {
      const data = await this.readJSON();
      const record = (data.goalActionDeliveries || []).find(d => d.id === deliveryId && d.workspaceId === workspaceId);
      if (record) {
        record.status = status;
        record.httpStatus = httpStatus;
        record.errorMessage = errorMessage;
        if (status === 'delivered') {
          record.deliveredAt = new Date().toISOString();
        }
        await this.writeJSON(data);
      }
      return record;
    }
  }

  /**
   * Get action delivery history for a goal.
   */
  async getGoalActionDeliveries(goalId) {
    if (this.isProduction && this.connected) {
      const result = await pgClient.query(
        'SELECT * FROM goal_action_deliveries WHERE goal_id = $1 ORDER BY created_at DESC',
        [goalId]
      );
      return result.rows.map(r => this.camelCaseKeys(r));
    } else {
      const data = await this.readJSON();
      return (data.goalActionDeliveries || [])
        .filter(d => d.goalId === goalId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
    logInfo('trial_usage_recorded');
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
      const trialDays = getSubscriptionPlan().trialDays;
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
      : (subscriptionData.planType === 'free' ? 0 : getSubscriptionPlan().monthlyPrice);

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

      const allowedFields = {
        planType: 'plan_type', status: 'status', isTrial: 'is_trial', trialEndDate: 'trial_end_date',
        pricePerMonth: 'price_per_month', billingCycleStart: 'billing_cycle_start', nextBillingDate: 'next_billing_date',
        ecpayMerchantTradeNo: 'ecpay_merchant_trade_no', ecpayTradeNo: 'ecpay_trade_no',
        lastPaymentDate: 'last_payment_date', lastPaymentStatus: 'last_payment_status', failedPaymentCount: 'failed_payment_count',
        lastFailedAt: 'last_failed_at', pausedAt: 'paused_at', gracePeriodEndAt: 'grace_period_end_at', canceledAt: 'canceled_at'
      };
      for (const [key, column] of Object.entries(allowedFields)) {
        if (updateData[key] !== undefined) {
          fields.push(`${column} = $${paramIndex++}`);
          values.push(updateData[key]);
        }
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
    const amount = parseMinorUnitAmount(paymentData.amount);
    const currency = normalizeCurrency(paymentData.currency);
    if (!Number.isInteger(amount) || !currency) throw new Error('Invalid payment money');
    const totalSuccessAmount = paymentData.totalSuccessAmount == null
      ? null
      : parseMinorUnitAmount(paymentData.totalSuccessAmount, { minimum: 0 });
    if (paymentData.totalSuccessAmount != null && !Number.isInteger(totalSuccessAmount)) throw new Error('Invalid payment total');
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
        ON CONFLICT (ecpay_trade_no) WHERE ecpay_trade_no IS NOT NULL DO NOTHING
        RETURNING *
      `, [
        paymentId,
        paymentData.subscriptionId,
        paymentData.userId,
        amount,
        currency,
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
        totalSuccessAmount,
        paymentData.status === 'success' ? (paymentData.paidAt || new Date()) : null
      ]);
      if (result.rows[0]) return { ...this.camelCaseKeys(result.rows[0]), wasDuplicate: false };
      const existing = await pgClient.query('SELECT * FROM payment_history WHERE ecpay_trade_no = $1', [paymentData.ecpayTradeNo]);
      return existing.rows[0] ? { ...this.camelCaseKeys(existing.rows[0]), wasDuplicate: true } : null;
    } else {
      const data = await this.readJSON();
      if (!data.paymentHistory) data.paymentHistory = [];

      const existing = data.paymentHistory.find(payment => paymentData.ecpayTradeNo && payment.ecpayTradeNo === paymentData.ecpayTradeNo);
      if (existing) return { ...existing, wasDuplicate: true };

      const newPayment = {
        id: paymentId,
        subscriptionId: paymentData.subscriptionId,
        userId: paymentData.userId,
        amount,
        currency,
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
        totalSuccessAmount,
        createdAt: new Date().toISOString(),
        paidAt: paymentData.status === 'success' ? (paymentData.paidAt || new Date().toISOString()) : null,
        updatedAt: new Date().toISOString()
      };

      data.paymentHistory.push(newPayment);
      await this.writeJSON(data);
      return { ...newPayment, wasDuplicate: false };
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
