# Goal Contributions & Idempotency Architecture

## 1. Overview

In live streaming applications, stream overlays must never display duplicate progress increments caused by:
- ECPay webhook retries
- Cloudflare worker edge retries
- Network reconnects during Server-Sent Event (SSE) drops
- User re-submitting test triggers

The **Goal Contributions Subsystem** implements strict atomic idempotency with integer accounting and comprehensive audit trails.

---

## 2. Idempotency Invariant & Database Schema

Every contribution toward a goal is recorded in the `goal_contributions` table:

```sql
CREATE TABLE IF NOT EXISTS goal_contributions (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  goal_id VARCHAR(64) NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  revenue_event_id VARCHAR(64) REFERENCES revenue_events(id) ON DELETE SET NULL,
  source VARCHAR(32) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  supporter_name VARCHAR(128),
  raw_amount_minor BIGINT NOT NULL,
  raw_currency VARCHAR(3) NOT NULL,
  fx_rate_used NUMERIC(14, 6),
  fx_provenance VARCHAR(32),
  contribution_amount_minor BIGINT NOT NULL,
  rule_applied VARCHAR(32) NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_contributions_dedup 
ON goal_contributions(goal_id, revenue_event_id) 
WHERE revenue_event_id IS NOT NULL;
```

### Key Properties:
1. **Idempotency Index (`goal_id`, `revenue_event_id`):**
   If the exact same `revenue_event_id` is processed again for the same `goal_id`, the database enforces uniqueness. The Goal Engine detects this and returns `{ processed: true, duplicate: true }` without incrementing `current_amount_minor`.
2. **Multi-Tenant Isolation:**
   Workspaces are isolated by `workspace_id`. Two different workspaces can process events with identical external IDs without collision.
3. **Manual Adjustments Allowance:**
   Manual adjustments have `revenue_event_id = NULL` (or a unique synthetic ID per submission), allowing legitimate repeated adjustments while keeping unique audit tracking.

---

## 3. Atomic Transaction Boundary

```javascript
await db.transaction(async (client) => {
  // 1. Lock goal row for update
  const goal = await db.getGoalForUpdate(goalId, client);
  
  // 2. Check if contribution already exists
  const existing = await db.getGoalContributionByRevenueEvent(goalId, revenueEventId, client);
  if (existing) {
    return { duplicate: true };
  }

  // 3. Insert goal contribution
  await db.createGoalContribution({ ...contributionData, epoch: goal.epoch }, client);

  // 4. Atomically update goal total
  const newAmount = Math.max(0, goal.current_amount_minor + contributionAmountMinor);
  await db.updateGoalProgress(goalId, { current_amount_minor: newAmount }, client);
});
```

---

## 4. Epoch Tracking & Safe Goal Resets

When a creator resets their goal:
1. The goal's `epoch` counter is incremented (`epoch = epoch + 1`).
2. The `current_amount_minor` is reset to `starting_amount_minor`.
3. **All existing `goal_contributions` remain in the database unaltered**, retaining their original `epoch` number.
4. Creators can query all contributions across all epochs or filter by a specific epoch for accurate reporting.
