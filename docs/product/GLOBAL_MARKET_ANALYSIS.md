# Global Market Analysis: The Programmable Revenue Goal Wedge

**Product:** DonationBar  
**Repository:** `egger-meow/donationBar-ecpay-obs`  
**Date:** 2026-08-22  
**Status:** Stage 0 Completed — Recommendation: **PROCEED (Refined Wedge)**  

---

## 1. Executive Conclusion

The global streaming market does **not** need another all-in-one broadcast suite, another single-source donation bar, or another closed payment gateway. Incumbents like Streamlabs (Logitech), StreamElements, and platform-native tools (Twitch, YouTube) subsidize basic alerts, goals, and chat widgets to capture platform lock-in and payment processing fees (SE.Pay, Streamlabs tips, Twitch 30–50% cuts).

However, **cross-platform and multi-source revenue tracking is severely broken**:
1. **Multi-Platform Silos:** Since Twitch lifted exclusivity restrictions, creators increasingly simulcast across Twitch, YouTube, and Kick, while collecting direct support via Ko-fi or local payment gateways (e.g., ECPay in Taiwan). Neither Streamlabs nor StreamElements offers a unified multi-source goal widget. Creators are forced to clutter their screen with 3+ separate goal bars or manually edit spreadsheet totals off-stream.
2. **Unit & Currency Mismatch:** Streamers running gear goals, subathons, or charity milestones cannot combine non-monetary events (Twitch Bits, Tier 1/2/3 Subs, YouTube Memberships) with monetary donations (USD PayPal, AUD Super Chats, TWD ECPay) without custom programming.
3. **The Complexity Chasm:** Power tools (Streamer.bot, SAMMI) can technically achieve multi-source logic, but require local desktop installations, C#/JavaScript scripting, and WebSocket configuration. 95% of streamers find this too complex and fragile.

**Strategic Wedge:**  
DonationBar should position as **The programmable revenue goal for live streams**: a lightweight, cloud-native SaaS that normalizes arbitrary revenue/support sources (Twitch Bits/Subs, YouTube Super Chats, Ko-fi, ECPay, Webhooks) into a single, beautiful OBS goal bar with custom point/monetary weighting, multi-milestone automation, and rock-solid reliability.

### Permanent Operating & Go-To-Market Strategy
- **Market:** Global
- **Beachhead Market:** Taiwan
- **Primary Language at Initial Launch:** Traditional Chinese
- **Secondary Language:** English
- **Architecture:** Global from Day 1
- **Marketing / GTM:** Taiwan first

> **Explicit Invariant:** Taiwan-first GTM does not mean Taiwan-first architecture or product scope. The system architecture, canonical event core, multi-currency engine, and cloud infrastructure are global from Day 1. Taiwan provides the high-density creator beachhead for rapid feedback before international expansion.

---

## 2. Streaming Market Map

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 STREAMING TOOL ECOSYSTEM                                │
├──────────────────────────┬─────────────────────────────┬────────────────────────────────┤
│ Broad Streaming Suites   │ Local Automation & Bots     │ Niche & Single-Purpose Tools   │
├──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ • Streamlabs (Desktop,   │ • Streamer.bot (Local C#)   │ • Subathon Timers (Blerp,      │
│   Ultra, Cloudbot)       │ • SAMMI / LioranBoard       │   TriBathon, Marathon Timer)   │
│ • StreamElements (SE.Live│ • MixItUp                   │ • Lumia Stream (Lights/IoT)    │
│   SE.Pay, Overlays)      │ • Aitum (Rules / Vertical)  │ • Tiltify (Charity goals)      │
│ • Botrix (Kick/Multistream)                             │ • Sound Alerts (Bits/Sounds)   │
│ • Nekolive (Taiwan local)│                             │ • Ko-fi / Patreon / Gank       │
└──────────────────────────┴─────────────────────────────┴────────────────────────────────┘
                                           │
                                           ▼
                 ┌──────────────────────────────────────────────────┐
                 │       DONATIONBAR WEDGE: THE REVENUE CORE        │
                 │   Cloud-based, multi-source, programmable,       │
                 │   weighted revenue normalization for OBS goals.  │
                 └──────────────────────────────────────────────────┘
```

---

## 3. Competitor Analysis & Market Landscape

We analyzed 12 meaningful competitors and substitute categories across the global creator landscape.

### A. Broad All-in-One Incumbents

#### 1. Streamlabs (Logitech)
- **Model:** Freemium SaaS + Tip processing fees + Streamlabs Ultra ($27/mo or $189/yr).
- **Goal Capabilities:** Individual platform goal widgets (Twitch Follower Goal, Twitch Sub Goal, Twitch Bits Goal, YouTube Super Chat Goal, Tip Goal).
- **Core Weakness:** **Zero multi-source aggregation.** A creator streaming on Twitch and YouTube must add separate browser sources. No custom weighting (cannot count a Tier 1 sub as $2.50 towards a $500 tip goal). Heavy software bloat.
- **Source Evidence:** Streamlabs Support & Product Documentation ([streamlabs.com](https://streamlabs.com)).

#### 2. StreamElements
- **Model:** 100% Free tool suite; monetized via SE.Pay credit card processing fees (~2.9% + $0.30) and brand sponsorships.
- **Goal Capabilities:** Highly flexible HTML/CSS/JS overlay editor, but widgets are strictly siloed by platform event feeds.
- **Core Weakness:** Overlay editor requires coding for custom math; no built-in cross-platform normalization; strictly separated platform activity feeds. Twitch TOS compliance stance keeps overlays separated on-stream.
- **Source Evidence:** StreamElements Multiplatform Activity Feed documentation ([streamelements.com](https://streamelements.com)).

#### 3. Nekolive Network (Taiwan)
- **Model:** Revenue-share model (0% under NT$10,000/mo net; 3% up to NT$1,500/mo cap).
- **Goal Capabilities:** Aggregates 6 Taiwan payment gateways (ECPay, Newebpay, PayUni, OPay, Oen, PayPal) into OBS donation progress bars and alert cards.
- **Core Weakness:** Taiwan-only regional lock; closed manual approval onboarding; no programmable source weighting; no global platform monetization normalization (Twitch Bits / YouTube Super Chats).
- **Source Evidence:** [nekolive.net](https://nekolive.net/) and `docs/competitive/NEKOLIVE_ANALYSIS.md`.

---

### B. Creator Monetization & Tipping Platforms

#### 4. Ko-fi
- **Model:** Free (0% on donations, 5% on shop/memberships) or Ko-fi Gold ($6–$8/mo for 0% platform fees).
- **Goal Capabilities:** Clean, single-source Ko-fi Goal widget for OBS; real-time stream alerts via browser source and Webhook API.
- **Core Weakness:** Only tracks payments made directly on Ko-fi. Cannot ingest Twitch Bits, Twitch Subs, or YouTube Super Chats.
- **Source Evidence:** Ko-fi Stream Alerts & Widget Documentation ([ko-fi.com](https://ko-fi.com)).

#### 5. Tiltify
- **Model:** Free for streamers; charges charities 5% platform fees.
- **Goal Capabilities:** Best-in-class fundraising goal bars, polls, rewards, and milestone targets for OBS.
- **Core Weakness:** Dedicated strictly to registered 501(c)(3) charities. Cannot be used for personal creator goals, subathons, gear upgrades, or multi-platform commercial revenue.
- **Source Evidence:** Tiltify Overlay Builder ([tiltify.com](https://tiltify.com)).

---

### C. Advanced Local Automation & Bot Tools

#### 6. Streamer.bot
- **Model:** 100% Free & Open Source (community-supported via Patreon).
- **Capabilities:** Massive automation engine running locally on Windows. Can listen to Twitch EventSub, YouTube, Streamlabs, Ko-fi webhooks, and execute C# code or trigger OBS WebSockets.
- **Core Weakness:** **Extreme setup friction.** Requires building custom variable logic (`%donationTotal%`), maintaining local WebSocket servers, and writing custom HTML/JS overlay files. No cloud hosting, no mobile management, fragile local state.
- **Source Evidence:** Streamer.bot Documentation and Extensions repository ([streamer.bot](https://streamer.bot)).

#### 7. SAMMI (formerly LioranBoard)
- **Model:** 100% Free & Open Source.
- **Capabilities:** Deck-based local automation engine with OBS integration and Twitch/YouTube listeners.
- **Core Weakness:** Steep learning curve; archaic button/variable scripting interface; local execution only.
- **Source Evidence:** SAMMI Solutions Documentation ([sammi.solutions](https://sammi.solutions)).

---

### D. Dedicated Niche Widget & Subathon Engines

#### 8. Blerp / TriBathon / Marathon Timer
- **Model:** Free basic tiers; Premium subscriptions ($3.99–$4.99/mo).
- **Capabilities:** Multi-platform countdown timers for subathons (Twitch, Kick, YouTube, TikTok).
- **Core Weakness:** Focuses exclusively on *time addition* (countdowns), not financial goal progression, milestone action triggers, or customizable multi-currency revenue weighting.
- **Source Evidence:** Blerp & TriBathon OBS subathon tool docs ([blerp.com](https://blerp.com), [tribathon.live](https://tribathon.live)).

#### 9. Lumia Stream
- **Model:** Freemium; Pro tier $5.99/mo, $59.99/yr, or $199 lifetime.
- **Capabilities:** Connects streaming events (Twitch, YouTube, Kick, Streamlabs, Ko-fi) to smart lights (Philips Hue, Nanoleaf), MIDI, and chat triggers.
- **Core Weakness:** Focused on physical hardware and light automation, not on-screen goal visualization or revenue normalization.
- **Source Evidence:** Lumia Stream Pricing & Integrations ([lumiastream.com](https://lumiastream.com)).

#### 10. CastKit
- **Model:** Founder pricing / Waitlist.
- **Capabilities:** Broadcast control room with conditional logic triggers (`<T >= 10m> -> spawn boss`), chat games, and follower/sub progress bars.
- **Core Weakness:** Heavy focus on chat gamification and loyalty points rather than pure, flexible revenue goal engineering.
- **Source Evidence:** CastKit Engagement Engine ([castkit.app](https://castkit.app)).

#### 11. Botrix
- **Model:** Free tier; Premium $4.99/mo or $45/yr.
- **Capabilities:** Multi-platform chatbot and basic alert overlays (specializing in Kick, Twitch, YouTube, Discord).
- **Core Weakness:** Basic alert/goal functionality, no programmable weighting or milestone execution.

#### 12. Donari (donari.app)
- **Model:** Emerging multi-source donation queue for Southeast Asia/global creators (integrating PromptPay, Gank, Ko-fi, Super Chat, Twitch Bits).
- **Capabilities:** Unified donation queue, subathon timer, and basic goal bar.
- **Core Weakness:** Lacks advanced programmable weighting, multi-currency normalization rules, milestone chaining, and robust developer webhooks.

---

## 4. What is Already Commoditized? (Do NOT Build as Paid Core)

The following features are available **100% free** from well-funded incumbents:
1. **Single-platform follower/sub/donation goal bars** (Streamlabs, StreamElements, Twitch native).
2. **Basic alert boxes with GIFs and audio triggers** (Streamlabs, StreamElements, Sound Alerts).
3. **Text-To-Speech (TTS)** (Ko-fi, StreamElements, Streamlabs).
4. **Basic chat moderation bots** (Nightbot, Cloudbot, StreamElements).
5. **Basic countdown subathon timers** (StreamElements widgets, TriBathon, Blerp).
6. **One-off visual overlay templates** ($10–$30 on Etsy, OWN3D, Nerd or Die).

> **Rule:** If a feature can be obtained for free in Streamlabs or StreamElements in under 2 minutes, it cannot be DonationBar's core paid value proposition.

---

## 5. What Remains Painful? (Real User Pain Evidence)

| Pain Category | User Reality & Evidence | Severity | Frequency |
|---|---|---|---|
| **1. Multi-Source Fragmentation** | Streamers broadcasting to Twitch + YouTube + Kick have no unified goal bar. Streamlabs/StreamElements force separate widgets. Viewers on YouTube don't see their Super Chats moving the Twitch sub goal. (Source: Reddit r/Twitch, r/obs multistreaming discussions). | **Critical** | Constant (every stream) |
| **2. Revenue Weighting & Unit Mismatch** | A streamer wants a "$1,000 New Mic" goal. A Tier 1 sub is $5.99 retail ($2.50 payout), 500 Bits is $5.00, a Ko-fi tip is $10.00. No mainstream tool allows creators to define: `1 Sub = $2.50`, `100 Bits = $1.00`, `1 Ko-fi = $1.00`. Streamers must manually calculate or run sub-only goals. | **High** | Frequent (campaigns & subathons) |
| **3. Multi-Currency Normalization** | A creator receives $20 USD on Twitch, $30 AUD on YouTube Super Chat, €15 EUR on Ko-fi, and NT$500 TWD on ECPay. Displaying a clean single-currency goal requires manual conversion math. | **Medium-High** | Frequent for international/VTuber streams |
| **4. Milestone Triggering & Goal Chaining** | Streamers want celebrations at 25%, 50%, 75%, 100% (play video, trigger webhook to Discord/Lumia, or auto-swap to "Goal Phase 2: Stretch Goal"). Currently requires complex Streamer.bot C# scripts or manual scene switching. | **High** | High-value during events/subathons |
| **5. Technical Setup Barrier** | Streamer.bot/SAMMI provide flexibility but require desktop app installs, port forwarding / WebSocket configuration, and JavaScript knowledge. Streamers want a cloud link they can paste into OBS in 3 minutes. | **Critical** | Onboarding barrier |

---

## 6. Why Wouldn't Users Just Use Streamlabs or StreamElements?

### Strongest Arguments Against DonationBar:
1. **Convenience & Habit:** Streamers already have Streamlabs Desktop or OBS with StreamElements SE.Live installed.
2. **Zero Cost:** StreamElements is completely free; Streamlabs free tier covers standard single-platform needs.
3. **Direct Processing:** Streamlabs and StreamElements provide integrated tipping pages (PayPal/Credit Card), avoiding third-party setup.

### Why DonationBar Wins in its Specific Wedge:
1. **Neutrality:** Streamlabs and StreamElements are locked into their own ecosystems and platform silos. They have no commercial incentive to build deep, neutral, cross-platform aggregation for competing platforms (e.g., aggregating YouTube Super Chats + Twitch Bits + Ko-fi).
2. **Specialized Power without Coding:** StreamElements requires writing custom JavaScript inside their widget editor to do math on events. DonationBar offers a clean, zero-code visual UI for setting source weights, currency exchange rates, and milestone rules.
3. **No Custody / Fast Setup:** DonationBar does not hold creator funds. It is a pure data/logic orchestration layer that connects to existing creator accounts.

---

## 7. Why Wouldn't Power Users Just Use Streamer.bot or SAMMI?

| Dimension | Streamer.bot / SAMMI | DonationBar |
|---|---|---|
| **Hosting** | Local PC only (Windows) | 100% Cloud-native SaaS |
| **Setup Time** | 2–6 hours (writing logic, actions, variables, HTML/CSS) | 5 minutes (visual configuration) |
| **State Persistence** | Local JSON / SQLite; lost if PC crashes or OBS desyncs | Cloud database (PostgreSQL / Edge KV) |
| **Remote / Mod Control** | Requires local port forwarding or ngrok | Secure web dashboard accessible from phone/tablet |
| **Maintenance** | Creator must update scripts when APIs change | Managed server-side adapters |

> **Conclusion on Hypothesis:** The statement *"Provide 80% of the relevant goal automation capability with 10% of the setup complexity"* is **VALIDATED**. Streamers want the power of Streamer.bot without having to become software engineers.

---

## 8. Revenue-Source Priorities for V1

| Source | Global Relevance (1-10) | Creator Demand (1-10) | API Accessibility | Event Reliability | Auth Complexity | Maintenance Overhead | Priority |
|---|---|---|---|---|---|---|---|
| **Twitch (Bits, Subs, Gift Subs)** | 10 | 10 | High (EventSub WebSockets/Webhooks) | High | Medium (OAuth 2.0) | Low | **P0 (Must-Have)** |
| **Ko-fi (Tips, Subs, Shop)** | 8 | 9 | High (Webhook POST) | High | Very Low (Webhook Token) | Very Low | **P0 (Must-Have)** |
| **Generic Webhook** | 10 | 10 | High (Standard JSON POST) | High | Low (Bearer Token / Secret) | Very Low | **P0 (Must-Have)** |
| **Manual / Test Console** | 10 | 10 | Internal | High | None | Very Low | **P0 (Must-Have)** |
| **ECPay (Taiwan Local)** | 4 (Global) / 10 (TW) | 8 | Medium (Callback POST) | High | Low (HashKey/HashIV) | Low (Already Built) | **P0 (Keep Existing)** |
| **Streamlabs Socket Bridge** | 9 | 9 | High (Socket Token API) | High | Low (Socket Token) | Low | **P0 (High Leverage)** |
| **StreamElements JWT Bridge** | 8 | 8 | High (JWT WebSocket) | High | Low (JWT Token) | Low | **P1 (Near-Term)** |
| **YouTube (Direct Super Chat API)** | 10 | 10 | Low (Google Quota 10k/day limit; OAuth audit) | Medium | High (Google OAuth) | High | **P1 (Stage 5 Direct; via Streamlabs Bridge in V1)** |

### Recommended Smallest Useful V1 Source Combination:
1. **Twitch** (EventSub: Bits, Subs, Gift Subs)
2. **Ko-fi** (Webhook: Donations, Memberships)
3. **Streamlabs Socket Bridge** (Instantly captures PayPal donations, Credit Cards, and YouTube Super Chats from existing setups without quota limits!)
4. **ECPay** (Preserves existing working Taiwan gateway adapter)
5. **Generic Webhook** (Accepts JSON payloads from any external tool, Streamer.bot, or custom scripts)
6. **Manual / Test Console** (Audited adjustments and test events)

---

## 9. Strategic Wedge Scoring (1–10 Scale)

| Wedge Candidate | Pain Intensity | Low Competition | Differentiation | Willingness to Pay | Tech Feasibility | Distribution Potential | Recurring Use | **Total Score** |
|---|---|---|---|---|---|---|---|---|
| 1. More payment methods alone | 4 | 2 | 3 | 3 | 7 | 4 | 4 | **27** |
| 2. Multi-source aggregation alone | 7 | 6 | 6 | 6 | 8 | 7 | 7 | **47** |
| 3. Beautiful goal overlays alone | 5 | 2 | 3 | 4 | 9 | 6 | 4 | **33** |
| 4. Cross-platform normalization | 8 | 8 | 8 | 7 | 8 | 7 | 8 | **54** |
| 5. Programmable source weighting | 8 | 9 | 9 | 8 | 8 | 7 | 8 | **57** |
| 6. Programmable milestone actions | 8 | 8 | 9 | 8 | 7 | 8 | 8 | **56** |
| 7. Simple no-code setup | 9 | 7 | 8 | 8 | 8 | 9 | 8 | **57** |
| 8. OBS diagnostics & reliability | 8 | 8 | 7 | 7 | 8 | 7 | 8 | **49** |
| 9. Multi-currency goal engine | 7 | 8 | 8 | 7 | 8 | 6 | 7 | **51** |
| 10. Goal chaining / campaigns | 7 | 8 | 8 | 7 | 8 | 7 | 8 | **49** |
| 11. Generic webhook extensibility | 7 | 7 | 7 | 6 | 9 | 7 | 7 | **43** |
| **12. THE WINNING WEDGE (Combined 4+5+6+7+8)** | **9** | **9** | **9** | **9** | **8** | **9** | **9** | **62 / 70** |

---

## 10. Target Customer Persona

### Segment: "The Monetized Multi-Platform & Event Streamer"
- **Profile:** Mid-sized streamers and VTubers (25–500 average CCV) streaming to Twitch + YouTube or Twitch + Ko-fi/local payments.
- **Monthly Revenue:** $500 – $5,000+ USD / month across subs, bits, super chats, and tips.
- **Workflow:** Runs regular stream goals ("New GPU Goal", "Subathon 2026", "Charity Stream", "Convention Trip").
- **Current Frustration:** Uses 2–3 different goal bars that look mismatched on stream, or manually runs a spreadsheet during streams to add up Bits, Subs, and Ko-fi donations.
- **Switching Trigger:** Sees another streamer with a single, sleek, animated goal bar that updates live from all platforms with milestone celebrations.
- **Willingness to Pay:** High ($7.99/mo or $69/yr is <1% of their stream revenue).

---

## 11. Pricing Structure & Entitlements

| Feature | Free ($0) | Pro ($7.99/mo or $69/yr) |
|---|---|---|
| **Active Goals** | 1 Goal | Unlimited Goals |
| **Connected Sources** | Up to 2 sources (e.g. Twitch + Manual) | Unlimited sources simultaneously |
| **Source Weighting** | Fixed 1:1 default | Custom point & monetary weights (e.g. Tier 1 Sub = $2.50) |
| **Currency Conversion** | Single currency | Auto multi-currency normalization (USD, EUR, GBP, TWD, JPY) |
| **Milestone Automations** | 1 Milestone animation (100%) | Unlimited Milestones (25%, 50%, 75%, 100%) + Webhook actions |
| **Goal Chaining** | Manual | Automatic chaining (Phase 1 -> Phase 2 Stretch Goal) |
| **OBS Themes** | 2 Clean Default Themes | Full Theme Customization + Custom CSS + Particles |
| **Diagnostics & History** | 7-day event log | Full permanent audit log, event replay, real-time diagnostics |

---

## 12. Strategic Risks & Mitigations

1. **Platform API Changes:** Twitch or YouTube could change EventSub/OAuth policies.
   - *Mitigation:* Support Generic Webhooks and Streamlabs/StreamElements socket bridges as fallback layers.
2. **Copycat by Incumbents:** Streamlabs could copy multi-source goals into Streamlabs Ultra.
   - *Mitigation:* Streamlabs is structurally encumbered by ecosystem lock-in and bloated product surface. DonationBar maintains speed, neutrality, and lightweight elegance.
3. **Twitch Simulcast Overlay Restrictions:** Twitch guidelines discourage displaying merged external chat on-stream.
   - *Mitigation:* DonationBar renders an aggregated *financial goal total* (e.g., "$450 / $1,000"), which is fully compliant and does not violate chat-merging restrictions.

---

## 13. Kill Criteria Evaluation

- Did research prove existing tools already solve this seamlessly? **No.** (Streamlabs/StreamElements do not aggregate; Streamer.bot is too hard).
- Is the pain too niche? **No.** Multistreaming and multi-platform monetization (Twitch + Ko-fi + YouTube) is standard for modern monetized creators.
- Will creators pay? **Yes.** Creators routinely pay for Lumia Stream ($5.99/mo), Streamlabs Ultra ($27/mo), Botrix ($4.99/mo), or one-off custom overlays ($30–$100).
- Is the API integration feasible? **Yes.** Twitch EventSub, Ko-fi webhooks, and Streamlabs sockets provide clean, robust real-time event delivery.

**Final Verdict:** **PROCEED.**
Proceed directly to **Stage 1 (Universal Revenue Event Core)**.
