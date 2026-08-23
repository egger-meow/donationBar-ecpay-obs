# Goal Milestones & Automation Architecture

## 1. Overview

Milestones allow streamers to celebrate community achievements and automate their broadcast workflow when reaching progress thresholds (e.g. 25%, 50%, 75%, 100%).

Supported actions in V1:
- **Ordered Real-time SSE Delivery (`event: milestone`)** broadcast to OBS overlays containing visual and sound directives.
- **Visual Animation** on OBS Browser Source (`visualAction: true`).
- **Sound Effect Alert** (`soundAction: true`).
- **SSRF-Hardened Outbound Webhook Dispatch** (`webhookActionUrl: 'https://...'`) with manual redirect revalidation and Cloudflare Worker lifecycle safety (`ctx.waitUntil`).
- **Automated Next-Goal Chaining** at 100% completion with write-time and runtime cycle protection.

---

## 2. Threshold Crossing Detection Algorithm

The Milestone Evaluator (`lib/goal-engine/milestone-evaluator.js`) uses a deterministic threshold-crossing algorithm:

```javascript
export function getCrossedMilestones({
  milestones,
  previousAmountMinor,
  newAmountMinor,
  targetMinor,
  epoch = 1,
  existingTriggers = []
})
```

### Key Properties:
- **Sequential Multi-Cross Handling:** If a large donation jumps progress from 40% to 80%, both 50% and 75% milestones are returned in strictly ascending order (`[50, 75]`) and emitted sequentially over SSE.
- **Zero Double-Fires:** Each milestone is recorded in `goal_milestone_triggers` with composite key `(goal_id, epoch, threshold_percent)`. It can never fire a second time within the same epoch.
- **Negative Adjustments Support:** If an administrator reduces goal progress from 80% to 40%, milestones that were already triggered remain marked as triggered for that epoch unless the goal is explicitly reset.

---

## 3. Realtime SSE Broadcast (`event: milestone`)

When milestones are crossed, the server emits a dedicated `event: milestone` Server-Sent Event over `/events` for each triggered milestone:

```json
{
  "type": "milestone",
  "goalId": "cf203d10-ba93-4396-94d7-aeaf411e8c95",
  "milestoneId": "m-50",
  "thresholdPercent": 50,
  "label": "50% Halfway!",
  "visualAction": true,
  "soundAction": true,
  "currentAmountMinor": 50000,
  "targetAmountMinor": 100000,
  "currency": "TWD",
  "epoch": 1,
  "timestamp": "2026-08-23T11:50:00.000Z"
}
```

The OBS overlay client in `public/overlay.html` listens for `event: milestone` and triggers celebration animations and sounds.

---

## 4. SSRF-Protected Outbound Webhook Dispatcher

When a milestone with `webhookActionUrl` triggers, the engine dispatches an HTTP POST payload via `dispatchMilestoneWebhookAction` in `lib/goal-engine/outbound-webhook.js`.

### Security Protections:
1. **Private IP, Loopback & CGNAT Blocking:**
   Blocks `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `198.18.0.0/15`, `localhost`, `::1`, `fc00::/7`, `fe80::/10`, and decimal/hex IP encodings.
2. **Cloud Metadata Protection:**
   Unconditionally blocks cloud instance metadata endpoints (`169.254.169.254`, `metadata.google.internal`, `metadata.azure.internal`, `instance-data`).
3. **Manual Redirect Revalidation (`redirect: 'manual'`):**
   Re-validates each intermediate `Location` header to prevent redirect-based SSRF pivoting to private addresses.
4. **Lifecycle-Safe Dispatch & Bounded Retries:**
   Uses `ctx.waitUntil(promise)` when running on Cloudflare Workers. Tracks delivery states (`pending` -> `delivered` / `failed`) in `goal_action_deliveries` with up to 2 retries on transient network errors.
5. **Isolation Guarantee:**
   Goal completion, contribution persistence, and OBS broadcast never depend on remote webhook success.

