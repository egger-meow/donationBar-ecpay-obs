import app from '../server.js';
import database from '../lib/database.js';
import { handleFetchWithExpress } from '../lib/worker-adapter.js';

let dbInitPromise = null;

/**
 * Cloudflare Worker Entry Point for Donatio.
 * Bridges standard Web Fetch requests with the canonical Express application,
 * leveraging Cloudflare nodejs_compat and Hyperdrive.
 */
export default {
  async fetch(request, env, ctx) {
    // Initialize PostgreSQL connection with Worker environment bindings if needed
    if (!dbInitPromise) {
      dbInitPromise = (async () => {
        try {
          if (env && (env.HYPERDRIVE || env.DATABASE_URL)) {
            await database.initPostgreSQL({ env });
          }
        } catch (err) {
          console.error('Database initialization error in Worker:', err);
        }
      })();
    }
    await dbInitPromise;

    return handleFetchWithExpress(app, request, env, ctx);
  }
};
