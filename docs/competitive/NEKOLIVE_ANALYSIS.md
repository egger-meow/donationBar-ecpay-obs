# Competitive analysis: Nekolive Network (貓咪娛樂 Nekolive)

Status: initial analysis from public information, 2026-07-16. Not yet validated by
direct user interviews — see [open questions](#open-questions-for-interviews) and
[STREAMER_INTERVIEW_GUIDE.md](../beta/STREAMER_INTERVIEW_GUIDE.md).

## Why this document exists

Nekolive Network is a live, operating direct competitor already serving the exact
segment DonationBar was scoping toward: Taiwan-local payment aggregation wired into
OBS donation alerts, aimed at Twitch/YouTube creators. Its feature set invalidates the
assumption that "Taiwan-local payment connected to OBS" is by itself a defensible
product position. This document exists so that roadmap decisions are made against a
real competitor's actual behavior, not an assumed empty market.

Sources (public, fetched 2026-07-16): [nekolive.net](https://nekolive.net/),
a creator's public endorsement thread on X/Twitter describing feature coverage.
Reconcile against direct interview evidence before treating any line below as final.

## Summary comparison

| Dimension | Nekolive Network | DonationBar (current) |
|---|---|---|
| Onboarding | Manual: Discord application to a named human ("蜜糖貓"), or a self-service form at apply.nekolive.net followed by email confirmation and approval wait. No stated SLA. | Self-service: Google OAuth sign-in, workspace creation, ECPay credential entry — no human approval step. Not yet proven end-to-end with an external streamer in real staging. |
| Payment providers | Six aggregated: 應援科技 (Oen), 統一金流 (PayUni), 歐付寶 (OPay), 藍新金流 (Newebpay), PayPal, 綠界科技 (ECPay/Green World). Viewer picks a provider at checkout. | One: ECPay only, behind a provider-independent core designed for future adapters. |
| Pricing | Revenue-share with a threshold: 0% until monthly net revenue exceeds NT$10,000, then 3% of net revenue, capped at NT$1,500/month. No flat subscription option. | Flat SaaS trial/beta pricing (currently sandbox/beta-only, not a public commitment) — no revenue percentage taken by the platform. Real founder pricing (NT$199–399/month) not yet validated with a paying external user. |
| OBS/overlay tooling | Browser alert notifications (custom text/color/font/tiered sounds), donation progress bars (multiple styles, HTML/CSS editable), donation card lists, resend/replay button, overtime timer tied to Twitch follows/bits/subs/raids/channel points. | Reconnecting SSE overlay, progress bar with color overrides, sandbox test-alert path. No donation card list, no leaderboard, no overtime timer, no replay-in-production yet. |
| Reliability signals | None published (no status page, SLA, or public incident history found). Reliability is unverified from the outside. | No public status page yet either. Internal roadmap tracks staged payment/callback/replay evidence and monitoring alerts as explicit P0 gates before claiming production-readiness — this is a documentation gap to close, not a code gap. |
| Support model | Discord-based human support tied to a named community manager; implies support quality scales with headcount and community-manager availability. | Not yet operating with a real cohort; planned support model is a lightweight SLA plus interview cadence (see BETA_OPERATIONS_RUNBOOK.md), not yet exercised against real users. |
| Customization | Extensive: HTML/CSS overlay editing, many alert/sound/tier options, loyalty points, VIP automation, check-in system, viewer queue, first-time-viewer detection, timed broadcasts, chat commands, hype train alerts, auto-shoutouts. | Deliberately narrow: one thin donation-to-OBS path, Chinese activation checklist, no chat-bot feature set. |
| Twitch/Discord bot integration | Full Twitch chat bot (raid shoutouts, VIP auto-management, channel point rewards, auto-responses, chat commands, hype train, first-time-viewer detection) plus Discord donation notifications. | None. Out of scope by explicit roadmap decision (see below). |
| Media requests / leaderboards | YouTube/Twitch clip requests via donation page or channel points; automatic monthly leaderboard tracking. | None yet; a future "core retention slice" (goal/top/latest/replay/TTS) is scoped but not built, and stays behind activation-flow evidence. |
| Target customer (observed) | Broad: "individual creators, groups, and enterprises" — an open, high-volume funnel gated by manual approval rather than segment filtering. | Narrowing to monetized Taiwanese streamers who already have real donation volume and value reliability, speed, diagnostics, and predictable pricing over a maximal feature list. |

## What this invalidates

"We connect Taiwan-local payment methods to an OBS overlay" is not a unique position —
Nekolive has done this, with six providers instead of one, for an unknown but apparently
nonzero and endorsed user base. Competing on payment-method breadth or overlay feature
count against an incumbent with years of feature accretion is a losing race for a
single-provider product with no announced user base yet.

## Where a real gap plausibly exists

These are hypotheses, not confirmed advantages — validate them through interviews, not
by asserting they're true:

1. **No manual application gate.** Nekolive's onboarding requires a human to approve a
   Discord or form application before a streamer can start. This is a real, structural
   speed and scale bottleneck a self-service flow can beat by construction — assuming
   DonationBar's own self-service flow actually completes in minutes, which is not yet
   proven against a real external streamer.
2. **Fixed pricing vs. revenue share.** Nekolive takes a percentage above a revenue
   threshold. A streamer with predictable, growing donation volume may prefer knowing
   their platform cost in advance. This only matters if the fixed price is competitive
   at the volumes a serious streamer actually reaches — model this before pitching it as
   an advantage (see [Fixed vs. revenue-share pricing crossover](#fixed-vs-revenue-share-pricing-crossover)).
3. **Diagnosability of failures.** No evidence Nekolive exposes creator-facing
   diagnostics for a failed callback or missed OBS delivery beyond a resend button.
   Actionable, specific failure states (what failed, why, what to do) are cheap to build
   relative to their trust value and are already partially scoped in the existing
   roadmap (P0 Observable operations).
4. **Support model that doesn't bottleneck on one person.** Nekolive's stated support
   contact is a single named individual. That does not scale and is a plausible source
   of friction Nekolive's own users may complain about — worth asking about directly in
   interviews rather than assuming.

None of these are proven advantages yet. They are the hypotheses the required
interviews (below) exist to test.

### Fixed vs. revenue-share pricing crossover

Nekolive's fee is 0 below NT$10,000/month net revenue, then 3% up to a NT$1,500/month
cap (i.e., the cap is reached at NT$50,000/month net revenue). A flat NT$199–399/month
DonationBar price is:

- **Cheaper than Nekolive** for a streamer earning above roughly NT$6,600–13,300/month
  net donation revenue (where 3% of revenue would exceed the flat fee) — i.e., cheaper
  once a streamer is already meaningfully monetized.
- **More expensive than Nekolive** for a streamer earning below that, since Nekolive
  charges nothing under the NT$10,000 threshold.

This means "fixed pricing" is not a universal win — it is specifically a pitch to
*already-monetized* streamers with predictable volume, which matches the revised target
customer below. Do not market flat pricing as strictly cheaper without qualifying the
volume it applies to.

## Roadmap items that would merely reproduce Nekolive features

Audited against [ROADMAP.md](../../ROADMAP.md) (2026-07-16 state): the roadmap does
**not** currently list any of these as build-now or near-term items — the existing
"Validate later" and "Reject for now" tables already gate multi-provider expansion and
broad feature building behind demand evidence. This is confirmed clean, not a finding
that requires new cuts. The explicit exclusion list below formalizes that boundary going
forward so it doesn't drift as work continues:

- Twitch chat bot feature parity (raid shoutouts, VIP automation, channel point rewards,
  auto-responses, hype train alerts, first-time-viewer detection, chat commands)
- Media request feature parity (YouTube/Twitch clip requests)
- Overtime timer
- Loyalty point system
- VIP automation
- Check-in systems
- Viewer queues
- A large surface of overlay configuration pages/styles
- Additional production payment providers before interview-backed demand evidence

If any future roadmap proposal matches an item on this list, it needs an explicit,
evidence-backed reason to override the exclusion — not silent inclusion.

## Open questions for interviews

See [STREAMER_INTERVIEW_GUIDE.md](../beta/STREAMER_INTERVIEW_GUIDE.md) for the full
question set aimed at current/former Nekolive users, rejected applicants, and creators
using ECPay directly or another platform. The core unknowns this analysis cannot answer
from public information alone:

- Actual approval wait time and rejection rate for Nekolive applications.
- Real incident/reliability history (outages, missed alerts, payment mismatches).
- How much support volume Nekolive's single named contact actually handles, and how
  users experience response time.
- Whether streamers who chose Nekolive value its broad chat-bot/queue/loyalty feature
  set, or tolerate it while using only the payment+overlay core.
- Willingness to switch platforms at all, given payment-history and viewer-habit
  lock-in.
