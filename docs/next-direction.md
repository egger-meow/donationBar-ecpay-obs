# Next Direction

DonationBar's next objective is to win a narrow Taiwan creator segment, prove recurring willingness to pay, and reach sustainable unit economics before expanding internationally.

The authoritative execution plan is [ROADMAP.md](../ROADMAP.md). It separates shipped capabilities from unverified launch evidence and future ideas.

## Competitive reset (2026-07-16)

A direct, operating competitor — Nekolive Network — was identified with broad feature
coverage (six payment providers, OBS alerts, progress bars, replay, donation cards,
leaderboards, media requests, Discord/Twitch bot integrations, overtime timer). See
[docs/competitive/NEKOLIVE_ANALYSIS.md](competitive/NEKOLIVE_ANALYSIS.md). "Taiwan-local
payment connected to OBS" is not by itself a differentiator. Broad feature expansion is
paused; the differentiation bet is now speed of self-service activation, no manual
approval gate, actionable failure diagnostics, and fixed pricing versus Nekolive's
revenue-share fee — aimed at streamers who already monetize seriously, not beginners.

## Current focus

1. Prove payment, subscription, tenant-isolation, migration, and recovery paths in deployed staging.
2. Prove the self-service activation flow beats Nekolive's manual-approval onboarding: one external, already-monetized streamer completes signup to a real OBS-rendered payment in under 15 minutes with zero developer intervention.
3. Ship actionable, creator-facing diagnostics for provider-connect, callback-verify, and OBS-delivery failures — the highest-leverage plausible advantage over an incumbent with no published reliability signals.
4. Run market-validation interviews across current/former Nekolive users, rejected applicants, direct-ECPay creators, and other-platform creators (see [docs/beta/STREAMER_INTERVIEW_GUIDE.md](beta/STREAMER_INTERVIEW_GUIDE.md)) to confirm or reject the competitive hypotheses before expanding the beta cohort.
5. Convert that first proven streamer toward a fixed founder-price subscription, explaining the pricing crossover against Nekolive's revenue share rather than claiming flat pricing is a universal win.
6. Do not resume broad feature/provider expansion — see the do-not-build-now list in [ROADMAP.md](../ROADMAP.md) section 6 — until the milestone above is proven with real evidence.

## Product boundary

DonationBar is the fastest, most reliable, fully self-service Taiwan payment-to-OBS
layer for streamers who already monetize seriously — not a feature-parity alternative to
Nekolive. Viewer donations settle through the creator's provider account; the platform
subscription is separate. ECPay is first. NewebPay, LINE Pay, virtual accounts,
convenience-store payments, and reconciliation are validation candidates, not
commitments, and stay gated behind interview-backed demand evidence.

Prioritize payment correctness, self-service activation speed, failure diagnosability, stream reliability, paid conversion, and retention.
