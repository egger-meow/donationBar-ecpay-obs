# PostgreSQL & Cloudflare Hyperdrive Architecture

**Product:** Donatio (斗內條)  
**Date:** 2026-08-22  
**Status:** Complete  

---

## 1. Overview

Donatio uses PostgreSQL as its authoritative, multi-tenant persistent data store. In Stage 2, the application runtime transitions to **Cloudflare Workers**, utilizing **Cloudflare Hyperdrive** to accelerate database queries and manage connection pooling at Cloudflare's global edge.

```text
+-------------------------------------------------------------------------------+
|                         CLOUDFLARE WORKER INSTANCE                            |
|  - Node.js compatibility layer (`nodejs_compat`)                              |
|  - `pg` Pool client                                                           |
|  - Connects using `env.HYPERDRIVE.connectionString`                           |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼ (TCP Socket over Cloudflare Edge Network)
+-------------------------------------------------------------------------------+
|                            CLOUDFLARE HYPERDRIVE                              |
|  - Edge connection pooling (maintains warmed connections to DB)               |
|  - Query pipelining and latency reduction                                     |
|  - SSL termination to origin database                                         |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼ (Direct TCP / TLS)
+-------------------------------------------------------------------------------+
|                            POSTGRESQL DATABASE                                |
|  - Authoritative data store                                                   |
|  - Tables: users, workspaces, workspace_settings, revenue_events, donations,   |
|            payment_providers, subscriptions, session                           |
+-------------------------------------------------------------------------------+
```

---

## 2. Hyperdrive Feature Compatibility Audit

| Database Concern | Hyperdrive Compatibility | Donatio Implementation |
|---|:---:|---|
| **Connection Pooling** | Supported natively by Hyperdrive | Worker instantiates `pg.Pool` with lightweight pooling, relying on Hyperdrive's global connection pool to prevent connection exhaustion on PostgreSQL. |
| **Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`)** | Supported | Stage 1 `revenue_events` and `donations` transactions execute with strict ACID isolation. Hyperdrive pins transactions to the same backend connection. |
| **Prepared Statements** | Supported | Hyperdrive supports parameterized queries (`$1, $2, ...`) without client-side prepared statement naming collisions. |
| **SSL / TLS Termination** | Supported | Hyperdrive handles SSL negotiation with origin PostgreSQL. Worker-to-Hyperdrive connection within Cloudflare is secure. |
| **Idempotency & Unique Constraints** | Supported | PostgreSQL unique indexes (`(workspace_id, source, external_event_id)` and `(workspace_id, merchant_trade_no)`) are strictly preserved and enforced. |
| **Session Store (`session` table)** | Supported | `connect-pg-simple` interacts with the `session` table over the Hyperdrive connection string. |
| **Advisory Locks & LISTEN/NOTIFY** | Not recommended over pooled proxies | Donatio does not use Postgres `LISTEN/NOTIFY` or advisory locks in request paths. Real-time events are dispatched via the application SSE pipeline. |

---

## 3. Database Connection Lifecycle in Workers

```javascript
// Database initialization in Worker context
export function createPgPool(connectionString) {
  return new pg.Pool({
    connectionString,
    max: 5, // Keep per-isolate pool small; Hyperdrive manages edge-to-origin pooling
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
  });
}
```

### Connection String Resolution Hierarchy:
1. `env.HYPERDRIVE?.connectionString` (Cloudflare Worker runtime with Hyperdrive binding)
2. `env.DATABASE_URL` (Direct Worker environment secret)
3. `process.env.DATABASE_URL` (Local Node.js development or CLI runner)

---

## 4. Production Safety Invariants

1. **No Silent JSON Fallback**: If running in production (`ENVIRONMENT=production` or `NODE_ENV=production`) and no PostgreSQL connection string is supplied, initialization throws immediately with:
   `DATABASE_URL is required in production; JSON fallback is disabled`
2. **Schema & Migration Durability**: Migrations are managed strictly through CLI tooling (`npm run migrate`) prior to deployment, never executed dynamically on Worker request cold starts.
3. **No Float Arithmetic**: All monetary fields (`amount_minor`, `price`, `total_amount`) are stored and computed strictly as integer minor units.
