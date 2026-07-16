# Streamer interview guide: competitive validation

Status: prepared 2026-07-16, not yet run. This guide exists to validate or invalidate
the hypotheses in [NEKOLIVE_ANALYSIS.md](../competitive/NEKOLIVE_ANALYSIS.md) before
building further on assumption. Complements, and does not replace, the general
onboarding-friction interview implied by the roadmap's beta operations work
(see [BETA_OPERATIONS_RUNBOOK.md](../operations/BETA_OPERATIONS_RUNBOOK.md) and
[BETA_RECRUITMENT_DRAFT.md](../operations/BETA_RECRUITMENT_DRAFT.md)).

## Who to recruit (five segments)

Interview across all five; a single segment cannot answer the competitive questions
below on its own.

1. **Current Nekolive users** — streamers actively using Nekolive today.
2. **Former Nekolive users** — streamers who tried it and stopped.
3. **Rejected/incomplete applicants** — streamers who applied to Nekolive but never
   completed onboarding or were not approved.
4. **Monetized creators using ECPay directly** — no aggregator, handling their own
   ECPay integration or a manual/ad-hoc donation process.
5. **Creators using another donation platform** — neither Nekolive nor raw ECPay
   (e.g., a global tool with weaker Taiwan payment support).

Target streamers who already monetize seriously — not beginners. This matches the
revised target customer: creators with real, recurring donation volume who would
plausibly feel a fixed monthly fee versus a revenue-share fee.

## Core questions (ask every segment, adapt phrasing)

1. Why did you choose or reject Nekolive?
2. How long did setup/onboarding actually take, start to finish?
3. What fails during a real stream? (Payment, alert delivery, overlay, something else?)
4. How often do you need to contact human support, and how does that go?
5. Would you prefer flat monthly pricing over a revenue-share fee? At what price?
6. What would make you switch platforms?
7. Of the features you use, which are essential to keep streaming, and which are
   decorative — nice to have but not something you'd miss?
8. Would you trust a new, smaller platform with your payment-to-alert delivery? What
   would it take to earn that trust?

## Segment-specific follow-ups

**Current Nekolive users**
- Walk me through your actual application process — Discord, self-service form, or
  both? How long from application to first live donation?
- Have you ever had a donation not show up in OBS, or show up late/duplicated? What did
  you do?
- Do you use the Twitch bot / loyalty / VIP / queue features, or mainly the
  payment+overlay core?
- What's the most support you've needed in a single month?

**Former Nekolive users**
- What specifically made you stop? Be as concrete as possible (an incident, a cost
  change, a feature gap, a support experience).
- Where did you go instead, if anywhere?

**Rejected/incomplete applicants**
- What happened after you applied? Did you get a response? How long did you wait before
  giving up (if you gave up)?
- Would you have preferred an instant self-service signup, even with fewer features
  at first?

**Monetized creators using ECPay directly**
- What was hardest about wiring ECPay to your stream yourself?
- What would a managed layer need to do to be worth paying for, given you've already
  done the integration work once?

**Creators using another platform**
- What does that platform get wrong for a Taiwan audience specifically (payment
  methods, language, support timezone)?
- What would make you consider switching to a Taiwan-focused alternative?

## What "essential vs. decorative" answers should drive

Map every "essential" answer against the current roadmap's build-now table
([ROADMAP.md](../../ROADMAP.md) section 6) and every "decorative" answer against the
explicit do-not-build list in
[NEKOLIVE_ANALYSIS.md](../competitive/NEKOLIVE_ANALYSIS.md#roadmap-items-that-would-merely-reproduce-nekolive-features).
If multiple interviewees independently call the same excluded feature (e.g., loyalty
points, overtime timer) essential rather than decorative, that is a signal to bring back
to a roadmap review — not a reason to unilaterally add it.

## Recording results

Log each interview as a dated entry appended to this file's results log (below) or to a
tracking sheet referenced from here — do not scatter interview notes into ad-hoc files.
Record, per interview: segment, setup time reported, top failure mode reported, pricing
preference (flat vs. revenue-share, and price point), essential vs. decorative feature
list, and trust blockers.

## Results log

_(No interviews conducted yet as of 2026-07-16. Append dated entries below as they
happen — do not edit or remove prior entries; correct in a new entry instead, matching
the convention in [PROGRESS.md](../PROGRESS.md).)_
