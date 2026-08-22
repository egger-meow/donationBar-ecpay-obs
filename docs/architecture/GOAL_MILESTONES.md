# Goal Milestones & Automation Architecture

## 1. Overview

Milestones allow streamers to celebrate community achievements and automate their broadcast workflow when reaching progress thresholds (e.g. 25%, 50%, 75%, 100%).

Supported actions in V1:
- **Visual Animation** on OBS Browser Source (`visual: true`)
- **Sound Effect Alert** (`sound: true`)
- **Outbound Webhook Dispatch** (`webhook_url: 'https://...'`) to external streamer bots (Streamer.bot, Discord, IFTTT)
- **Automated Next-Goal Chaining** at 100% completion

---

## 2. Threshold Crossing Detection Algorithm

The Milestone Evaluator (`lib/goal-engine/milestone-evaluator.js`) uses a deterministic threshold-crossing algorithm:

```javascript
export function evaluateMilestones({
  previousAmountMinor,
  newAmountMinor,
  targetAmountMinor,
  milestones,
  triggeredMilestones = [],
  currentEpoch = 1
}) {
  const prevPercent = Math.min(100, Math.floor((previousAmountMinor / targetAmountMinor) * 100));
  const newPercent = Math.min(100, Math.floor((newAmountMinor / targetAmountMinor) * 100));

  // Find all active milestones where threshold <= newPercent and was not crossed at prevPercent
  // AND has not already been recorded in triggeredMilestones for currentEpoch
  return milestones
    .filter(m => m.is_enabled !== false)
    .filter(m => m.threshold_percent > prevPercent && m.threshold_percent <= newPercent)
    .filter(m => !triggeredMilestones.some(t => t.threshold_percent === m.threshold_percent && t.epoch === currentEpoch))
    .sort((a, b) => a.threshold_percent - b.threshold_percent);
}
```

### Key Properties:
- **Sequential Multi-Cross Handling:** If a large donation jumps progress from 40% to 80%, both 50% and 75% milestones are returned in strictly ascending order (`[50, 75]`).
- **Zero Double-Fires:** Each milestone is recorded in `goal_milestone_triggers` with composite key `(goal_id, epoch, threshold_percent)`. It can never fire a second time within the same epoch.
- **Negative Adjustments Support:** If an administrator reduces goal progress from 80% to 40%, milestones that were already triggered remain marked as triggered for that epoch unless the goal is explicitly reset.

---

## 3. SSRF-Protected Outbound Webhook Dispatcher

When a milestone with `actions.webhook_url` triggers, the engine dispatches an HTTP POST payload via `lib/goal-engine/outbound-webhook.js`.

### Security Protections:
1. **Private IP & Loopback Blocking:**
   Blocks `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `localhost`, `::1`.
2. **Cloud Metadata Protection:**
   Blocks cloud instance metadata endpoints: `169.254.169.254`.
3. **Protocol Whitelisting:**
   Enforces `https:` only (or `http:` in local sandbox environments).
4. **Credential & Header Sanitization:**
   Rejects URLs embedding embedded credentials (`https://user:pass@domain`).
5. **Non-Blocking Delivery with Audit:**
   Webhook dispatch runs asynchronously with a 5-second timeout and records delivery status in `goal_action_deliveries`. Delivery failures are logged as non-fatal warnings and never disrupt the core transaction.

### Webhook Payload Schema:

```json
{
  "event": "milestone_triggered",
  "workspace_id": "ws_12345",
  "goal_id": "goal_67890",
  "goal_title": "New PC Goal",
  "threshold_percent": 50,
  "milestone_label": "50% Halfway there!",
  "current_amount_minor": 250000,
  "target_amount_minor": 500000,
  "currency": "TWD",
  "epoch": 1,
  "triggered_at": "2026-08-23T02:00:00.000Z"
}
```
