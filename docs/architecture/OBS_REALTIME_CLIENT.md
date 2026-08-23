# OBS Realtime Client & Connection Lifecycle

## Overview

The `RealtimeClient` establishes and maintains a persistent, low-latency Server-Sent Events (SSE) connection between the Donatio server (or Cloudflare Edge / SaaS proxy) and the OBS Browser Source.

---

## Connection States

| State | Description | Viewer Experience |
|---|---|---|
| `offline` | Initial or disconnected state before startup or upon unload | Clean transparent state |
| `connecting` | Attempting initial handshake to `/events` | Displays authoritative initial state fetched via `/progress` |
| `connected` | Active real-time event stream receiving `ping`, `message`, `milestone`, `overlay-settings` | Real-time animations on new events |
| `reconnecting` | Network glitch or edge server restart; performing backoff reconnect | Retains last known state without disruptive stream error banners |

---

## Reconnect Strategy & Authoritative Catch-Up

1. **Initial Load Sequence**:
   - `fetchOverlaySettings()`
   - `fetchGoalProgress()` -> Renders current state immediately (zero initial blank lag)
   - `connect()` -> Opens `/events?slug=<slug>&source=overlay`
2. **Exponential Backoff with Jitter**:
   - Delay: $\min(1500 \times 1.5^{\text{attempts}-1}, 30000) + \text{rand}(0, 500\text{ms})$
3. **State Catch-Up**:
   - Upon reconnecting successfully after a dropped connection, the client triggers `fetchGoalProgress()` to synchronize any donations or milestone increments that arrived while offline.
