# OBS Real-Time Delivery on Cloudflare Workers

**Product:** Donatio (斗內條)  
**Date:** 2026-08-22  
**Status:** Complete  

---

## 1. Overview & Challenge

Donatio delivers real-time donation alerts, goal progress updates, and overlay style changes to OBS browser sources via **Server-Sent Events (SSE)** at `/events?slug=<workspace_slug>&source=overlay`.

### The Cloudflare Workers Multi-Isolate Challenge
In traditional Node.js servers (e.g. Render), all connections terminate in a single long-running process with a shared `Map` of open HTTP response sockets in memory.

In Cloudflare Workers:
- Requests run in globally distributed, ephemeral isolates across 300+ edge locations.
- An OBS browser source connected in Tokyo might connect to the `NRT` edge isolate, while a payment webhook from Taiwan arrives at the `TPE` edge isolate.
- Storing open response objects in a global in-memory variable (`sseClients = new Map()`) is insufficient for cross-isolate broadcast without a coordination layer.

---

## 2. Architecture & Durable Objects Evaluation

### Evaluation of Options:

1. **Option A: Stateless Worker SSE Streaming + Client Reconnection / Polling Fallback**
   - Stream opens with standard `TransformStream` / `ReadableStream`.
   - Client fetches fresh `/progress?slug=<slug>` on initial load and on reconnect.
   - Works well for local dev and single-isolate environments; relies on client polling if isolates are completely isolated.
2. **Option B: Cloudflare Durable Objects (DO) for Real-Time Workspace Coordination**
   - Each workspace is routed to a globally unique Durable Object instance (`env.WORKSPACE_HUB.idFromName(workspaceId)`).
   - All SSE streams and WebSockets for that workspace connect to its Durable Object.
   - When a payment webhook or revenue event arrives at *any* Worker isolate, it sends an RPC or internal HTTP message to the workspace's Durable Object.
   - The Durable Object broadcasts the event immediately to all active streams for that workspace.
3. **Option C: Hybrid SSE with Stream Continuity**
   - Stage 2 implements Worker-compatible streaming using standard Web `TransformStream` with keep-alive heartbeats and graceful fallback to `/progress` polling.
   - Prepares the interface for Stage 3 Goal Engine integration where Durable Objects or WebSockets can be enabled as needed.

### Decision for Stage 2:
- Implement Worker-native SSE streaming via Web `ReadableStream` / `TransformStream` with `Content-Type: text/event-stream` and 30-second ping keep-alives.
- Ensure `public/overlay.html` retains its resilient reconnection loop (exponential backoff up to 30s) and loads initial progress on connect/reconnect.
- Maintain workspace isolation: public overlays receive only progress and sanitized alert events; owner sessions receive administrative diagnostics.

---

## 3. Streaming Protocol & Headers

The `/events` endpoint responds with the following mandatory HTTP headers:
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
Access-Control-Allow-Origin: *
X-Accel-Buffering: no
```

### Event Payload Formats:

1. **Progress Update Event (`message` default):**
```text
data: {"title":"斗內目標","current":300,"goal":1000,"percent":30,"latestDonation":{"alertId":"alert-123","payer":"Alice","amount":300,"message":"加油！"}}

```

2. **Overlay Appearance Settings (`overlay-settings`):**
```text
event: overlay-settings
data: {"progressBarColor":"#34d399","width":900,"fontSize":16}

```

3. **Keep-Alive Ping (`ping`):**
```text
event: ping
data: 1724328000000

```

---

## 4. Reconnection & Idempotency Safeguards

1. **Duplicate Alert Prevention**:
   - `public/overlay.html` tracks `lastSeenAlertId`.
   - On SSE reconnect or initial load, the current progress snapshot is rendered without replaying past alert sounds/animations.
   - Only new donations with an unseen `alertId` trigger the alert animation and audio.
2. **Resource Cleanup**:
   - Worker stream cancellation (`stream.cancel()`) cleans up intervals and closes backend subscriptions when an OBS browser source is disconnected or scene is changed.
