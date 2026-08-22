# Competitive Matrix: DonationBar vs. Global Streaming Ecosystem

**Product:** DonationBar  
**Date:** 2026-08-22  
**Scope:** Stage 0 Competitor Comparison & Differentiation Map  

---

## 1. Comprehensive Competitive Matrix

| Dimension | Streamlabs | StreamElements | Ko-fi | Tiltify | Streamer.bot / SAMMI | Blerp / TriBathon | Nekolive | **DonationBar (Target V1)** |
|---|---|---|---|---|---|---|---|---|
| **Twitch Bits & Subs** | ✅ Native (Siloed) | ✅ Native (Siloed) | ❌ No | ❌ Charity Only | ✅ Via EventSub | ✅ Subs/Bits Timer | ⚠️ Limited Alerts | **✅ Native EventSub** |
| **YouTube Super Chats** | ✅ Native (Siloed) | ✅ Native (Siloed) | ❌ No | ❌ Charity Only | ✅ Via Polling/Bridge | ✅ Super Chat Timer | ❌ No | **✅ Via Bridge/API** |
| **Kick Support** | ⚠️ Partial | ❌ No | ❌ No | ❌ No | ✅ Community C# | ✅ Kick Timer | ❌ No | **✅ Webhook / Bridge** |
| **Direct Tipping (PayPal/CC)** | ✅ Streamlabs Tips | ✅ SE.Pay / PayPal | ✅ Native (Stripe/PP) | ✅ Non-Profit | ⚠️ Via Streamlabs Webhook | ❌ No | ✅ 6 TW Gateways | **✅ Ko-fi / ECPay / Webhook** |
| **Unified Multi-Source Goal** | ❌ **No** (Separate widgets) | ❌ **No** (Separate widgets) | ❌ **No** (Ko-fi only) | ❌ **No** (Tiltify only) | ⚠️ **Scripted** (Requires C#) | ⚠️ **Time Only** (Subathon) | ❌ **No** (TW Gateways only) | **🏆 BEST IN CLASS (Native)** |
| **Multi-Currency Normalization** | ❌ Fixed single currency | ❌ Fixed single currency | ❌ Base currency only | ❌ Campaign currency | ⚠️ Custom C# Script | ❌ Fixed conversion | ❌ TWD only | **🏆 BEST IN CLASS (Auto-rates)** |
| **Custom Source Weighting** | ❌ Fixed (1 sub = 1 sub) | ❌ Fixed (1 sub = 1 sub) | ❌ None | ❌ None | ⚠️ Manual Scripting | ⚠️ Time Multiplier | ❌ None | **🏆 BEST IN CLASS (e.g. Sub=$2.50)** |
| **Milestone Triggers (25/50/75%)**| ⚠️ Basic alerts | ⚠️ Basic alerts | ❌ No | ✅ Incentive Targets | ✅ Endless C# logic | ❌ Countdowns only | ❌ Single goal end | **🏆 BEST IN CLASS (Built-in)** |
| **External Actions / Webhooks** | ⚠️ Ultra App Store | ❌ Custom JS only | ⚠️ Discord Bot | ⚠️ Limited | ✅ Full Desktop WebSockets | ❌ No | ⚠️ Discord only | **✅ Outbound Webhooks** |
| **Goal Chaining (Phase 1 -> 2)** | ❌ Manual scene swap | ❌ Manual scene swap | ❌ No | ❌ No | ⚠️ Complex Deck Logic | ❌ No | ❌ No | **🏆 BEST IN CLASS (Automated)** |
| **Inbound Webhook Support** | ❌ Closed | ❌ Closed | ❌ Closed | ❌ Closed | ✅ Local HTTP Listener | ❌ Closed | ❌ Closed | **✅ Cloud Webhook Endpoint** |
| **OBS Integration Method** | Browser Source | Browser Source | Browser Source | Browser Source | Local WebSocket / File | Browser Source | Browser Source | **Browser Source (Cloud SSE)** |
| **Hosting Model** | Cloud | Cloud | Cloud | Cloud | **Local PC App** | Cloud | Cloud | **Cloud-Native Edge** |
| **Setup Complexity** | Low (5 mins) | Low (5 mins) | Very Low (2 mins) | Medium (15 mins) | **Very High (2–6 hrs)** | Low (5 mins) | High (Manual Approval) | **Low (5 mins)** |
| **Free Tier Available** | ✅ Yes (Limited) | ✅ Yes (100% Free) | ✅ Yes (0% tip fee) | ✅ Yes (Charity) | ✅ Yes (FOSS) | ✅ Yes (Basic) | ⚠️ 0% under NT$10k | **✅ Yes (1 Goal, 2 Sources)** |
| **Pricing** | $27/mo ($189/yr) | Free (takes tip fee) | $6–$8/mo Gold | 5% Charity Fee | Free / Donations | $3.99–$4.99/mo | 3% rev-share | **$7.99/mo ($69/yr)** |
| **Target Customer** | Broad Streamers | Broad Streamers | Artists & Creators | Charity Fundraisers | Ultra-Tinkerer Streamers | Subathon Runners | Taiwan Monetized | **Monetized Multi-Platform Creators** |

---

## 2. Competitive Differentiation: Where DonationBar Stands

### 🟢 Where DonationBar is Better (Core Advantages)
1. **True Multi-Source Goal Aggregation:** Combines Twitch Bits + Twitch Subs + YouTube Super Chats + Ko-fi Tips + ECPay + Webhooks into one synchronized OBS progress bar.
2. **Programmable Source Weighting:** Allows creators to define custom contribution rules (e.g. `Tier 1 Sub = $2.50`, `100 Bits = $1.00`, `Ko-fi Tip = 100%`).
3. **Multi-Currency Normalization:** Live conversion of incoming multi-currency donations (EUR, AUD, TWD, GBP) to the streamer's chosen display currency (USD).
4. **Milestone Engine & Goal Chaining:** Out-of-the-box support for visual celebrations, sound cues, webhook dispatches, and auto-transitioning to stretch goals upon completion.
5. **Simplicity vs. Power (The 80/10 Rule):** Delivers 80% of Streamer.bot's goal customization power with 10% of the friction (browser-based, no C# coding, no local WebSocket ports).

---

### 🟡 Where DonationBar is Equal (Parity Areas)
1. **OBS Browser Source Delivery:** Modern CSS overlays with transparent backgrounds, responsive scaling, and instant SSE updates.
2. **Reliability & Reconnects:** Automatic reconnect logic for network interruptions during live streams.
3. **Free Tier Generosity:** Free tier allows casual streamers to run 1 full active goal across 2 sources at zero cost.

---

### 🔴 Where DonationBar is Worse (Intentional Trade-offs / Competitor Strengths)
1. **All-in-One Breadth:** Streamlabs and StreamElements offer full chat bots, loyalty point stores, custom tipping gateways, and thousands of overlay packs. DonationBar **refuses** to build an all-in-one suite.
2. **Direct Payment Custody / Gateway:** Ko-fi, PayPal, and StreamElements allow viewers to enter credit cards directly on their pages. DonationBar does not hold money or process viewer credit cards directly (except via connected provider adapters like ECPay/Ko-fi).
3. **Infinite Local Logic:** Streamer.bot allows arbitrary C# code execution, MIDI triggers, and local hardware I/O. DonationBar offers structured cloud-based rules and webhooks, not arbitrary local code execution.

---

## 3. Substitutes & Workarounds Analysis

| Current Creator Workaround | Why Creators Hate It | How DonationBar Wins |
|---|---|---|
| **Multiple Goal Bars on OBS** | Clutters the stream; divides community attention; feels amateurish. | One unified, sleek, responsive goal bar. |
| **Manual Spreadsheet Updates** | Requires streamer or mod to tab out mid-stream to update numbers. | 100% automated real-time event ingestion. |
| **Streamer.bot / SAMMI Scripts** | Fragile local state; breaks on app restart; takes hours to build HTML widgets. | Cloud-synced, mobile-accessible, 5-minute setup. |
| **Sub-Only Goals (Ignoring Bits/Tips)** | Leaves revenue on the table because tips don't help the on-screen goal. | Weighted normalization allows all revenue types to contribute fairly. |
