# Cloudflare Workers Runtime Compatibility Audit

**Product:** Donatio (斗內條)  
**Date:** 2026-08-22  
**Target Runtime:** Cloudflare Workers (`compatibility_date = "2024-09-23"`, `compatibility_flags = ["nodejs_compat"]`)  
**Status:** Complete  

---

## 1. Executive Summary

This document audits all Node.js and Express server assumptions in Donatio across HTTP mechanics, Node built-in APIs, persistence, and external service interactions. Each component is classified according to its behavior under Cloudflare Workers with `nodejs_compat`.

### Summary of Classifications
1. **Works through `nodejs_compat`**: Cryptography (`node:crypto`), buffers (`Buffer`), strings, URLs, UUID generation (`uuid`), standard JSON serialization, promises, `AsyncLocalStorage`, and TCP socket networking (`node:net` / `pg`).
2. **Needs Worker Adaptation**: HTTP request/response lifecycle (`app.listen` replaced with `export default { fetch }`), static asset delivery (Cloudflare Workers Assets `[assets]`), SSE real-time streaming (`TransformStream` / `ReadableStream`), and raw-body byte buffering for ECPay signatures.
3. **CLI-Only / Outside Worker**: Database migrations (`migrations/`), backup/restore scripts (`operations/`), and staging preflight CLI runners (`operations/staging-preflight.js`).
4. **Must Be Removed from Production Runtime**: Persistent local file writes (`fs.writeFileSync`, `db.json` in production) and in-process single-node global SSE memory assumptions.

---

## 2. HTTP Runtime Audit

| Subsystem / Feature | Current Node/Express Behavior | Cloudflare Workers Runtime Behavior | Classification | Worker Adaptation Strategy |
|---|---|---|:---:|---|
| **App Lifecycle** | `app.listen(PORT)` binds to a local TCP port | Worker exports `default { async fetch(req, env, ctx) }` | **Needs Worker Adaptation** | Extract Express routing into `createApp()`; `server.js` listens locally for dev, while `src/worker.js` handles Fetch events. |
| **Request / Response** | Node `http.IncomingMessage` & `http.ServerResponse` | Standard Web Fetch `Request` & `Response` | **Needs Worker Adaptation** | Use an Express-to-Worker fetch bridge that wraps incoming requests and streams response data. |
| **Raw Request Bodies** | `bodyParser.urlencoded({ verify: (req, res, buf) => req.rawFormBody = buf })` | Request body is a Web `ReadableStream` / `ArrayBuffer` | **Needs Worker Adaptation** | Read raw `ArrayBuffer` from request before passing to body parser, preserving byte-exact payload for ECPay `CheckMacValue`. |
| **Body Parsing (JSON/Form)** | `body-parser` middleware | Web Fetch API `req.json()` / `req.formData()` or Express body parser via bridge | **Works through nodejs_compat** | Handled seamlessly through Express bridge with preserved body buffers. |
| **Security Headers** | `helmet(...)` setting CSP, HSTS, X-Content-Type-Options | Express Helmet middleware sets headers on response | **Works through nodejs_compat** | Preserved via Express app configuration. |
| **Rate Limiting** | `express-rate-limit` using in-memory process counters | In-memory counters are per-isolate (not global) | **Needs Worker Adaptation** | Keep application-level limiter for isolate defense; document Cloudflare WAF / Rate Limiting rules for global production edge. |
| **OAuth Callbacks** | Passport Google OAuth strategy with session state | Standard HTTP redirect and cookie-based state verification | **Works through nodejs_compat** | Session store must be backed by PostgreSQL; canonical callback URL set to `https://donatio.jjmowlab.com/api/auth/google/callback`. |
| **Cookies & Sessions** | `express-session` with `connect-pg-simple` | Session table read/written via PostgreSQL connection | **Works through nodejs_compat** | Use PostgreSQL session store over Hyperdrive connection string with `httpOnly`, `sameSite: 'lax'`, `secure: true`. |
| **Server-Sent Events (SSE)** | `res.writeHead(200, { 'Content-Type': 'text/event-stream' })` + `res.write(...)` | Web standard `TransformStream` / `ReadableStream` | **Needs Worker Adaptation** | Worker-native SSE streaming using `TransformStream` with keep-alive pings and workspace scoping. |
| **Static File Serving** | `express.static(path.join(__dirname, 'public'))` | Cloudflare Workers Static Assets (`[assets]`) | **Needs Worker Adaptation** | Map `[assets]` binding to `./public`; guard protected static pages (`/admin.html`, `/overlay.html`, `/donate.html`) in worker routing. |

---

## 3. Node APIs Audit

| Node API / Module | Current Usage in Codebase | Support in `nodejs_compat` | Classification | Recommendation |
|---|---|:---:|:---:|---|
| **`node:crypto`** | ECPay MD5/SHA256 signing, AES-256-GCM credential encryption, HMAC tokens, CSRF tokens | Full | **Works through nodejs_compat** | Retain existing `crypto` implementations in `lib/credentials.js`, `lib/ecpay.js`, and `lib/security.js`. |
| **`node:buffer`** | `Buffer.from(...)`, base64 encoding/decoding | Full | **Works through nodejs_compat** | Retain existing `Buffer` usage. |
| **`node:stream`** | Response piping, SSE streaming | Full | **Works through nodejs_compat** | Express stream responses function through Node compatibility layer. |
| **`node:path`** | File path resolution (`path.join`, `path.resolve`) | Full | **Works through nodejs_compat** | Keep for local development and CLI operations. |
| **`node:fs`** | `db.json` reads/writes for local sandbox | Read-only in assets; persistent write not supported in Workers | **Must be removed from production runtime** | `db.json` is strictly restricted to local sandbox mode. Production Workers fail fast if PostgreSQL is unavailable. |
| **`node:process`** | `process.env` access | Polyfilled via `nodejs_compat` | **Needs Worker Adaptation** | Pass Worker `env` bindings to configuration helpers or bridge to `process.env`. |
| **`node:net` / Sockets** | PostgreSQL connection (`pg` driver) | Supported via Cloudflare TCP sockets & Hyperdrive | **Works through nodejs_compat** | Connect to PostgreSQL through Hyperdrive connection string via `pg.Pool`. |
| **`node:timers`** | `setInterval` / `setTimeout` for SSE keep-alives and timeouts | Full | **Works through nodejs_compat** | Timers work within request execution context. |

---

## 4. Writable Filesystem & Sandbox Isolation

1. **Production Invariant**: Cloudflare Workers run in ephemeral isolates without a persistent local filesystem. No production request may attempt to write to local disk.
2. **Local Sandbox vs Production**:
   - In local development (`ENVIRONMENT=sandbox`), `lib/database.js` reads/writes `db.json`.
   - In Worker production, `lib/database.js` strictly requires a PostgreSQL connection (via `HYPERDRIVE` or `DATABASE_URL`). If missing, it immediately throws `DATABASE_URL is required in production; JSON fallback is disabled`.

---

## 5. Operations & CLI Tooling Boundaries

The following tools remain standard Node.js CLI programs executed in CI or local administrative environments, completely outside the Cloudflare Worker runtime:
- `migrations/migrate.js` & migration scripts (`npm run migrate`)
- `operations/postgres-backup.js` (`npm run backup`)
- `operations/postgres-restore.js` (`npm run restore`)
- `operations/staging-preflight.js` (`npm run preflight:staging`)

These scripts connect directly to PostgreSQL via standard Node `pg` and do not run inside Cloudflare Workers.
