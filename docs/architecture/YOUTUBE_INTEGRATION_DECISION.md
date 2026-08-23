# YouTube Integration Architectural Decision Record (ADR)

## Context

YouTube provides live stream monetization events (Super Chat, Super Stickers, and Channel Memberships) via the YouTube Live Streaming API (`liveChatMessages.list`).

---

## 1. Technical Analysis

### A. Polling Architecture & API Quota
- YouTube does not offer direct HTTP push webhooks for Super Chats; clients must poll `liveChatMessages.list` during an active live stream.
- Default Google Cloud API quota for YouTube Data API v3 is **10,000 units per day**.
- A single call to `liveChatMessages.list` consumes **5 units**.
- Polling a live chat every 3 seconds consumes:
  $$\frac{3600\text{ sec}}{3\text{ sec}} \times 5\text{ units} = 6,000\text{ units per hour}$$
- Under this constraint, a single streamer's broadcast would deplete the entire application's daily API quota in less than 2 hours.

### B. Live Stream State Complexity
- Polling requires resolving active `liveBroadcastId` and `liveChatId`, tracking broadcast transitions (upcoming $\to$ live $\to$ completed), and handling streamer quota tier increases with Google.

---

## 2. Decision

### Status: **DEFERRED TO P1 AFTER STAGE 5**

### Rationale:
1. **Quota Safety**: Without an enterprise YouTube quota extension or PubSub gateway, deploying unthrottled REST polling to production risks immediate API rate-limiting across all workspaces.
2. **Stage 5 Priority**: Twitch EventSub and Ko-fi Webhooks provide complete, zero-quota-drain push notifications perfectly aligned with Donatio's global architecture.
3. **P1 Roadmap**: YouTube Super Chat integration will be introduced as a dedicated P1 milestone following quota tier expansion and broadcast lifecycle automation.
