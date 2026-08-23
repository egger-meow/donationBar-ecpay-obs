# Streamlabs Integration Architectural Decision Record (ADR)

## Context

Streamlabs provides creator alert and donation events primarily through its real-time Socket API (`wss://sockets.streamlabs.com?token=<socket_token>`).

Donatio's production architecture is built on **stateless Cloudflare Workers** with Server-Sent Events (SSE) and HTTP Webhook intakes.

---

## 1. Technical Analysis

### A. Persistent Outbound WebSockets on Cloudflare Workers
- Ordinary Cloudflare Workers are designed for short-lived request/response cycles.
- While outbound `fetch()` can upgrade to a WebSocket, keeping persistent long-lived connections open 24/7 across hundreds or thousands of creator accounts requires:
  1. An always-running background process / container, or
  2. Cloudflare Durable Objects with WebSocket hibernation and keep-alive alarms.

### B. Scalability & Operational Risk
- If an ordinary stateless Worker attempts to hold open client WebSockets, cold starts, edge rebalancing, and execution time limits will result in dropped connections and lost donation events.
- Implementing an unreliable in-memory client in stateless Workers would violate Donatio's core production principle: *"Never build fragile infrastructure merely to make a stage look larger."*

---

## 2. Decision

### Status: **DEFERRED TO P1**

### Rationale:
1. **Mandatory Sources First**: Direct native integrations with Twitch (EventSub Webhooks) and Ko-fi (HTTP Webhooks) natively fit the Cloudflare serverless edge architecture without persistent socket complexity.
2. **Generic Webhook Fallback**: Streamlabs users can already bridge alerts reliably into Donatio via Generic Inbound Webhook (using Streamlabs Webhook integrations or tools like Make/Zapier).
3. **Future Production Path**: When Streamlabs native socket consumption is scheduled for P1, it will be implemented via dedicated Cloudflare Durable Objects or a lightweight container gateway.
