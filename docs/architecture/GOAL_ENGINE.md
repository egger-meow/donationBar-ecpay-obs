# The Programmable Goal Engine Architecture

## 1. Overview & Vision

**Donatio (斗內條)** connects fragmented creator support channels into a single, unified, programmable Goal Bar. The **Goal Engine** is the central orchestrator that transforms normalized **Revenue Events** from disparate sources into deterministic, audited progress updates on active live stream goals.

```
+-----------------------------------------------------------------------------------+
|                           Canonical Revenue Event                                 |
| (ECPay, Generic Inbound Webhook, Streamer.bot, Manual Adjustments, Test Console)  |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        Goal Rule Evaluation Pipeline                              |
|       (Source active? -> Rule type evaluation -> Zero-float FX conversion)        |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                     Idempotent Contribution Persistence                           |
|        Atomic Transaction: (goal_id, revenue_event_id) Dedup Index                |
|               Increments Goal current_amount_minor & Audit Log                    |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                     Milestone Detection & Automation Trigger                      |
| (Threshold crossing -> Epoch deduplication -> SSRF-Safe Outbound Webhook Delivery)|
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                    Goal Chaining & Real-time Projection                           |
|   (100% Completion -> Auto-activate Next Goal -> OBS Overlay SSE Broadcast)      |
+-----------------------------------------------------------------------------------+
```

---

## 2. Core Architectural Principles

1. **Deterministic Multi-Source Aggregation:**
   A single live goal can aggregate events across multiple active adapters simultaneously without collision.
2. **Strict Integer Accounting (Zero-Float Minor Units):**
   All monetary amounts, targets, starting progress, and contributions are calculated, stored, and compared as integer minor units (e.g. cents, $1.00 USD = `100`, NT$ 100 TWD = `10000`). Floating-point arithmetic is strictly forbidden in monetary pipelines.
3. **Idempotent Ingestion & Single-Credit Guarantee:**
   A unique composite index `(goal_id, revenue_event_id)` ensures that retried webhook deliveries, replayed callbacks, or network reconnects never double-credit a creator's goal.
4. **Safe Reset with Epoch Versioning:**
   Resetting a goal increments its `epoch` counter (`epoch = epoch + 1`) and resets progress to `starting_amount_minor` while **preserving 100% of historical donation and audit logs**. Milestone triggers are scoped by `(goal_id, epoch, threshold_percent)`, enabling milestones to fire fresh in the new round.
5. **SSRF-Safe Outbound Automations:**
   Outbound webhooks to streamer tools (e.g. Streamer.bot, Discord Webhook, IFTTT) are strictly validated against private IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), AWS/Cloudflare metadata endpoints (`169.254.169.254`), non-HTTP schemes, and unsafe credentials.
6. **Cycle-Protected Goal Chaining:**
   Goals can link to a `next_goal_id`. When the active goal reaches 100% target progress, the engine automatically completes the current goal and activates the successor, guarded by Tarjan-based cycle detection.

---

## 3. Pipeline Ingestion Workflow

When a Revenue Event is received by `server.js` or an adapter:

```javascript
import { processRevenueEventForGoalEngine } from './lib/goal-engine/goal-engine.js';

const result = await processRevenueEventForGoalEngine(db, revenueEvent, options);
```

### Ingestion Steps:
1. **Workspace & Goal Resolution:**
   Resolve the active goal for `revenueEvent.workspace_id`. If no goal is active, return `{ processed: false, reason: 'no_active_goal' }`.
2. **Rule Matching & Evaluation (`lib/goal-engine/goal-evaluator.js`):**
   Fetch configured `goal_source_rules` for the event's source. If the source is disabled or unconfigured (defaulting to enabled monetary passthrough), evaluate the contribution amount and convert currencies via `lib/fx/fx-service.js`.
3. **Atomic Persistence (`lib/database.js`):**
   Within a database transaction:
   - Check if `revenue_event_id` was already recorded for `goal.id`. If yes, gracefully return `{ duplicate: true }`.
   - Insert into `goal_contributions` capturing `raw_amount_minor`, `raw_currency`, `fx_rate_used`, `fx_provenance`, `contribution_amount_minor`, and `rule_applied`.
   - Atomically increment `goals.current_amount_minor`.
4. **Milestone Evaluation (`lib/goal-engine/milestone-evaluator.js`):**
   Calculate `previousPercent` and `newPercent`. Detect any crossed milestone thresholds that have not yet fired in `goal.epoch`.
   - Record trigger in `goal_milestone_triggers`.
   - Dispatch outbound webhooks asynchronously via `lib/goal-engine/outbound-webhook.js`.
5. **Auto-Chaining Check (`lib/goal-engine/goal-chaining.js`):**
   If `newPercent >= 100` and `goal.next_goal_id` is set, atomically mark the current goal completed and activate `next_goal_id`.
6. **OBS Overlay Broadcast (`server.js`):**
   Broadcast updated goal state to all connected OBS overlay clients via Server-Sent Events (`/events?slug=:slug`).

---

## 4. API Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/goals` | List all goals for workspace | Session / Owner |
| `POST` | `/api/goals` | Create a new goal | Session / Owner |
| `GET` | `/api/goals/active` | Get active goal + rules + milestones + contributions | Session / Owner |
| `GET` | `/api/goals/:goalId` | Get specific goal details | Session / Owner |
| `PATCH` | `/api/goals/:goalId` | Update goal parameters | Session / Owner |
| `POST` | `/api/goals/:goalId/activate` | Set goal as active (deactivates others) | Session / Owner |
| `POST` | `/api/goals/:goalId/deactivate` | Deactivate goal | Session / Owner |
| `POST` | `/api/goals/:goalId/reset` | Safe reset goal (increments epoch) | Session / Owner |
| `GET` | `/api/goals/:goalId/rules` | List source rules | Session / Owner |
| `PUT` | `/api/goals/:goalId/rules` | Replace / update source rules | Session / Owner |
| `GET` | `/api/goals/:goalId/milestones` | List milestone thresholds & triggers | Session / Owner |
| `PUT` | `/api/goals/:goalId/milestones` | Replace / update milestone configurations | Session / Owner |
| `POST` | `/api/goals/:goalId/adjustments` | Apply manual positive/negative adjustment | Session / Owner |
| `GET` | `/api/goals/:goalId/contributions`| Query contribution audit log | Session / Owner |

---

## 5. Storage Schema Reference

See [`migrations/20260823-create-goal-engine.sql`](../../migrations/20260823-create-goal-engine.sql) for full DDL:
- `goals`: Primary entity with `target_amount_minor`, `current_amount_minor`, `currency`, `epoch`, `is_active`, `next_goal_id`.
- `goal_source_rules`: Per-source rule configurations (`source`, `rule_type`, `config`, `is_enabled`).
- `goal_contributions`: Immutable audit ledger with FX rate snapshots and applied rule rationale.
- `goal_milestones`: Configured milestone thresholds and action payloads.
- `goal_milestone_triggers`: Epoch-scoped trigger record ensuring milestones fire exactly once per cycle.
- `goal_action_deliveries`: Audit history for outbound webhooks and action dispatches.
