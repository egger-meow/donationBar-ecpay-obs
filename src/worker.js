import app from '../server.js';
import database from '../lib/database.js';
import { validateProductionConfig } from '../lib/config.js';
import { handleFetchWithExpress } from '../lib/worker-adapter.js';

let initialized = false;
let initPromise = null;

/**
 * Cloudflare Worker Entry Point for Donatio.
 * Bridges standard Web Fetch requests with the canonical Express application,
 * leveraging Cloudflare nodejs_compat and Hyperdrive.
 */
export default {
  async fetch(request, env, ctx) {
    if (!initialized) {
      if (!initPromise) {
        initPromise = (async () => {
          try {
            // Populate process.env with Worker bindings
            if (env) {
              for (const [key, value] of Object.entries(env)) {
                if (typeof value === 'string') {
                  process.env[key] = value;
                }
              }
              if (env.HYPERDRIVE && env.HYPERDRIVE.connectionString) {
                process.env.HYPERDRIVE_CONNECTION_STRING = env.HYPERDRIVE.connectionString;
              }
            }

            try {
              validateProductionConfig(env || process.env);
            } catch (configError) {
              console.warn('Production config warning:', configError.message);
            }

            if (env && (env.HYPERDRIVE || env.DATABASE_URL || process.env.DATABASE_URL)) {
              await database.initPostgreSQL({ env });
            }
            initialized = true;
          } catch (err) {
            console.error('Worker initialization error:', err);
          }
        })();
      }
      await initPromise;
    }

    return handleFetchWithExpress(app, request, env, ctx);
  }
};
