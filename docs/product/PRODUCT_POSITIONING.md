# DonationBar Product Positioning Document

**Product:** DonationBar  
**Repository:** `egger-meow/donationBar-ecpay-obs`  
**Date:** 2026-08-22  
**Status:** Stage 0 Final Output  

---

## 1. Target Customer
**The Monetized Multi-Platform & Event Streamer**
- Active creators (Twitch Affiliates/Partners, YouTube Partners, VTubers, and variety streamers) with 25–500 average concurrent viewers.
- Creators who monetize across multiple channels (e.g. Twitch subs + YouTube Super Chats + Ko-fi tips + local payment gateways).
- Creators who run revenue-driven stream events: subathons, gear upgrades, convention trips, and community milestones.

---

## 2. The Core Problem
**Fragmented revenue tracking and inflexible stream goal widgets.**
- Incumbent tools (Streamlabs, StreamElements) force streamers to display separate, disconnected goal bars for each platform or monetization type.
- Non-monetary contributions (Bits, Subs, Memberships) cannot be assigned arbitrary monetary/point values toward a single goal without writing custom scripts.
- Multi-currency donations create math headaches and visual inconsistencies.
- Existing automation solutions (Streamer.bot, SAMMI) require technical coding, local Windows dependencies, and hours of fragile setup.

---

## 3. The Current Alternative
- **Status Quo 1:** Stacking 2–3 separate goal bars on screen (Twitch Sub Goal + YouTube Super Chat Goal + Streamlabs Tip Goal).
- **Status Quo 2:** Manual spreadsheet tracking during live streams (streamer or mod manually typing updates into a local text source).
- **Status Quo 3:** Complex local scripts in Streamer.bot or SAMMI driving custom HTML browser sources.

---

## 4. The Meaningful Difference
- **One Unified Goal:** Aggregates arbitrary revenue sources (Twitch, YouTube, Ko-fi, ECPay, Webhooks) into a single, clean OBS overlay.
- **Programmable Normalization:** Converts any event (1 Tier 1 Sub = $2.50, 100 Bits = $1.00, €10 Ko-fi = $10.80) into standard goal units automatically.
- **No-Code Cloud Engine:** Configured in a modern web dashboard in under 5 minutes with zero local software, zero C# scripting, and cloud-synced state.
- **Milestone Automations & Chaining:** Triggers visual animations, sounds, outbound webhooks (Discord, smart lights), and auto-swaps to stretch goals upon completion.

---

## 5. Product Promise (One Sentence)
> **Connect multiple creator revenue and support sources into one beautiful, programmable OBS goal bar.**

---

## 6. Homepage Headline (One Sentence)
> **One goal bar for all your revenue: combine Twitch, YouTube, Ko-fi, and tips with custom rules in minutes.**

---

## 7. V1 Feature Scope (Frozen: 6 Core Capabilities)

1. **Universal Revenue Ingestion:**
   - Native Twitch EventSub (Bits, Subs, Gift Subs).
   - Ko-fi Webhook Integration (Tips, Memberships).
   - Streamlabs Socket Bridge (Captures PayPal tips & Super Chats).
   - ECPay Adapter (Taiwan local credit card/ATM/CVS payments).
   - Generic Inbound Webhook (JSON payload ingestion from any external tool).
   - Manual & Test Event Console (Safe testing and mod adjustments).
2. **Normalized Goal Engine:**
   - Multi-source aggregation into a single active goal.
   - Configurable source weights (e.g. Tier 1 Sub = +$2.50).
   - Real-time multi-currency conversion to display currency.
3. **Milestone Engine:**
   - Percentage-based milestones (e.g., 25%, 50%, 75%, 100%).
   - Triggerable animations and audio alerts per milestone.
   - Outbound Generic Webhook trigger (for Discord, Lumia Stream, Zapier).
4. **Goal Chaining:**
   - Optional automatic transition from Goal Phase 1 to Goal Phase 2 (Stretch Goal) when 100% is reached.
5. **OBS Browser Source Overlay:**
   - Modern, responsive, transparent-background CSS overlay.
   - Live real-time updates via Server-Sent Events (SSE).
   - Resilient reconnect logic and layout protection against long text.
6. **Creator Diagnostics & Audit History:**
   - Real-time connection status, event verification log, and one-click replay.

---

## 8. Explicit Non-Goals (What DonationBar Refuses to Become)

1. **Not an All-in-One Streaming Suite:** No chat moderation bots, no channel point stores, no raid shoutouts, no scene switchers.
2. **Not a Money Custodian / Payment Processor:** DonationBar does not process viewer credit cards directly or hold creator balances. Viewer money settles directly in the creator’s connected platform account (Twitch, Stripe, PayPal, ECPay).
3. **Not a Media Request / Queue Tool:** No YouTube video request queues or song requests.
4. **Not a Bloated Template Marketplace:** Focuses on 2–3 exceptionally polished, high-performance, responsive default goal designs rather than hundreds of mediocre themes.

---

## 9. Paid Value (What Justifies Pro Subscription)

DonationBar uses a simple, creator-friendly model: **Free ($0)** vs **Pro ($7.99/mo or $69/yr)**.

### Why Creators Upgrade to Pro:
1. **Unlimited Source Connections:** Free tier allows 2 sources (e.g., Twitch + Manual); Pro allows connecting Twitch + YouTube + Ko-fi + ECPay + Webhooks simultaneously.
2. **Programmable Custom Weighting:** Setting custom monetary values for subscriptions, bits, and memberships.
3. **Automatic Multi-Currency Normalization:** Live exchange rate conversions for international audiences.
4. **Advanced Milestone Actions & Goal Chaining:** Auto-dispatching outbound webhooks and auto-advancing to stretch goals.
5. **Permanent Event Audit History & Priority Replay:** Full event logging and stream telemetry.
