# Architecture Decision Record: Database Hosting & Staging vs Production SLA

**Status:** Accepted  
**Date:** 2026-08-22  
**Context:** Stage 2 Cloudflare Production Infrastructure Migration  
**Product:** Donatio (斗內條)  

---

## 1. Context & Problem Statement

In migrating Donatio's application runtime to Cloudflare Workers, a database hosting architecture must be established that provides high data integrity, supports complex relational models (multi-tenant workspaces, revenue events, idempotency constraints, sessions), and maintains operational continuity.

We considered:
1. **Migrating to Cloudflare D1 (SQLite-based distributed DB)**
2. **Retaining PostgreSQL with Cloudflare Hyperdrive**

Furthermore, the current staging database is hosted on **Aiven Free Tier PostgreSQL**.

---

## 2. Decision 1: Retain PostgreSQL (Do Not Migrate to D1 in Stage 2)

### Decision:
PostgreSQL remains the sole authoritative data store for Donatio. We will **not** migrate to Cloudflare D1 in Stage 2.

### Rationale:
- **Risk Minimization**: Performing a runtime migration (Render → Cloudflare Workers) and a database engine migration (PostgreSQL → D1/SQLite) simultaneously introduces extreme risk to payment correctness, concurrency semantics, and data durability.
- **Relational Integrity & ACID Transactions**: Donatio relies heavily on strict PostgreSQL ACID transactions, foreign key constraints, and multi-column unique indexes for payment and revenue event idempotency (`(workspace_id, source, external_event_id)`).
- **Tooling Continuity**: Existing database migrations (`migrations/`), automated backup/restore scripts (`operations/`), and schema inspection tools are built and verified for PostgreSQL.
- **Hyperdrive Edge Acceleration**: Cloudflare Hyperdrive natively supports PostgreSQL, enabling edge connection pooling and query acceleration directly to PostgreSQL instances.

---

## 3. Decision 2: Aiven Free Staging Scope & Stage 7 Production Gate

### Decision:
1. **Stage 2 / Development / Staging**: Aiven Free Tier PostgreSQL is approved for development, automated staging tests, and internal pre-launch verification via Cloudflare Hyperdrive.
2. **Stage 7 Public Launch Gate (Strict Requirement)**: **Aiven Free is NOT approved as the permanent public-launch production database.**

### Rationale & Constraints:
- Aiven Free Tier services may power down or sleep after periods of inactivity, requiring manual resumption or causing unpredictable cold-start request latency/failures.
- Live streamers require 99.99% operational reliability during live broadcasts. A sleeping database will drop real-time donation overlays and payment callbacks.
- **Stage 7 Launch Gate**: Before Donatio opens to the public, the production database must be transitioned to an always-available, dedicated managed PostgreSQL instance (e.g. Paid Aiven PostgreSQL, Neon Production, AWS RDS, Supabase Pro, or equivalent managed provider with automated backups, point-in-time recovery, and 24/7 uptime SLAs).

---

## 4. Consequences & Action Items

- **Local Development**: Continues to support `ENVIRONMENT=sandbox` with `db.json` and local PostgreSQL.
- **Staging Worker**: Connects to Aiven Free PostgreSQL via Cloudflare Hyperdrive binding.
- **Pre-Launch Checklist (Stage 7)**: Add mandatory verification item to provision and verify a 24/7 production PostgreSQL database prior to public creator onboarding.
