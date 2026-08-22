// Provider callbacks need an isolated budget. They are authenticated by the provider
// signature path, while public traffic is not allowed to exhaust their callback quota.
export const GENERAL_RATE_LIMIT = 300;
export const PROVIDER_CALLBACK_RATE_LIMIT = 600;

export function isProviderCallbackPath(path) {
  return path === '/webhook' || path.startsWith('/webhook/') || path === '/ecpay/period/callback' || path === '/api/webhook/generic' || path.startsWith('/api/webhook/generic/');
}

/**
 * Cloudflare Worker / Edge compatible memory store for express-rate-limit.
 * Cleans up expired rate-limit buckets lazily on request without running
 * forbidden background setInterval timers at top-level / global module scope.
 */
export class EdgeMemoryStore {
  constructor() {
    this.hits = new Map();
    this.localKeys = true;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async get(key) {
    const record = this.hits.get(key);
    if (!record) return undefined;
    if (Date.now() > record.resetTime) {
      this.hits.delete(key);
      return undefined;
    }
    return { totalHits: record.totalHits, resetTime: new Date(record.resetTime) };
  }

  async increment(key) {
    const now = Date.now();
    let record = this.hits.get(key);
    if (!record || now > record.resetTime) {
      record = { totalHits: 1, resetTime: now + this.windowMs };
    } else {
      record.totalHits += 1;
    }
    this.hits.set(key, record);
    return { totalHits: record.totalHits, resetTime: new Date(record.resetTime) };
  }

  async decrement(key) {
    const record = this.hits.get(key);
    if (record && record.totalHits > 0) {
      record.totalHits -= 1;
    }
  }

  async resetKey(key) {
    this.hits.delete(key);
  }

  async resetAll() {
    this.hits.clear();
  }
}
