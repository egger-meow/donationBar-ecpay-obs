# Closed-Beta Operations Runbook

Status: prepared, not yet operating. Created 2026-07-11 for ROADMAP.md P1 **Beta
operations**. This is the operating system for the first 10–20 invited creators; it is
not evidence that a cohort has been recruited or that the four-week definition of done
has been met.

Keep the live roster, contact details, recordings, payment identifiers, and incident
details in an access-controlled system outside this repository. This runbook deliberately
uses participant IDs (for example, `B-001`), not names, emails, stream URLs, or payment
data.

## 1. Before inviting a creator

For each candidate that passes the [recruitment screen](BETA_RECRUITMENT_DRAFT.md):

1. Assign a non-identifying participant ID and record consent/contact preferences in the
   approved private tracker.
2. Confirm a named owner for support, product interviews, and payment incidents. The
   monitoring runbook's on-call owner is still a go-live prerequisite.
3. State the current closed-beta terms accurately: invited testing, configured trial
   length, and the price displayed at [the public pricing page](../../public/pricing.html).
   Do not promise a lifetime price, production SLA, refund outcome, or tax treatment.
4. Book an observed setup session, week-one check-in, and a 20-minute biweekly interview
   before sending the invite.
5. Do not invite participants to process real payments until P0 staging payment evidence
   and the legal/accounting gate are complete. Local/sandbox setup is appropriate only
   when its limits are explained.

## 2. Support handling targets

These are beta targets, not a contractual service-level agreement. Record every request
in the private tracker with participant ID, opened/acknowledged/resolved timestamps,
category, severity, and whether it blocked a stream.

| Severity | Examples | Acknowledge | Target next action | Escalation |
|---|---|---:|---:|---|
| P0 | Possible lost/duplicated payment, secret exposure, tenant-boundary issue | 1 hour while awake | Stop affected flow; preserve non-sensitive evidence | Follow the incident runbook and notify the accountable owner immediately |
| P1 | Overlay/downstream alert unavailable for a scheduled stream, failed onboarding payment | Same business day | Workaround or status update within 4 business hours | Product + engineering owner |
| P2 | Setup confusion, visual defect, feature request | 2 business days | Triage in weekly review | Product owner |
| P3 | General feedback, praise, non-blocking idea | 5 business days | Acknowledge and tag | Product owner |

P0/P1 payment and availability events also follow
[MONITORING_AND_INCIDENT_RESPONSE.md](MONITORING_AND_INCIDENT_RESPONSE.md); this table
does not override that incident process. Never put ECPay keys, session IDs, full callback
payloads, donor messages, or unredacted screenshots in a support ticket.

## 3. Onboarding observation and check-ins

Use the activation funnel as an observation aid, not surveillance. The platform-admin
endpoint `GET /admin/platform/activation-funnel` returns aggregate counts and median
durations only. It must not be used to expose one creator's records to another creator.

For each participant, record manually in the private tracker:

| Touchpoint | Timing | Capture | Success signal |
|---|---|---|---|
| Setup observation | First session | Where they hesitate, support minutes, exact blocker category | Provider, test donation, OBS, and live alert attempted |
| Week-one check-in | Day 5–8 | Answers from the recruitment draft, stream attempt, unresolved issue | First stream or a concrete blocker/remediation date |
| Biweekly interview | Every 14 days | Workflow, reliability, alternative used, support burden, price reaction | Retention/price evidence rather than feature votes |
| Exit interview | Within 7 days of stopping | Reason, severity, data/deletion request, willingness to return | Clear voluntary/involuntary churn classification |

### Biweekly interview questions

1. In the last two weeks, which streams used DonationBar and which did not? Why?
2. What was the last moment you hesitated or needed help? How long did it take to recover?
3. Did a donation, overlay, or alert behave unexpectedly? Capture time and impact without
   copying payment or donor data into notes.
4. What alternative would you use if DonationBar disappeared tomorrow?
5. Which one improvement would make the product materially more valuable next stream?
6. Given the disclosed closed-beta price and future Pro hypothesis, what would make the
   service worth paying for, and what would prevent it?

### Exit interview questions

1. Is the exit voluntary, due to a product problem, or due to eligibility/lifecycle?
2. What was the primary reason, and what evidence supports it?
3. Was there a payment, data, privacy, or reliability concern that requires incident
   follow-up?
4. May the team re-contact the creator after a fix? Record consent outside the repo.
5. Does the creator request export or deletion? Route to the accountable privacy owner;
   do not promise timing before the legal/data-retention policy is approved.

## 4. Weekly operating review

Run a 30-minute review at the same time each week. The owner records only aggregate
numbers in a private tracker and creates a dated, redacted decision note if a material
change is made.

| Metric | Source | Review question |
|---|---|---|
| Invited / accepted / activated / streamed | Private participant tracker | Where does the cohort drop out? |
| Activation conversion and median timing | Platform activation-funnel endpoint | Which milestone is slowest? |
| Streams active in last 7 days | Private participant tracker | Are users returning after setup? |
| P0/P1/P2 support count and median first response | Private support tracker | Is setup support trending down? |
| Payment/callback failures, duplicates, unmatched events | Monitoring + redacted operational queries | Is any payment correctness issue unresolved? |
| Price reactions and credible intent | Interview notes, aggregated | Is NT$299 still a plausible next hypothesis? |
| Voluntary / involuntary exits | Exit interviews | What needs fixing before adding more recruits? |

Weekly decisions must name one of: continue cohort unchanged, fix a P0/P1 issue before
new invites, revise onboarding material, schedule a focused retention experiment, or
pause recruitment. Do not promote a feature request into the roadmap without a stated
evidence source and affected cohort count.

## 5. Four-week gate

The P1 Beta Operations row is achieved only after four consecutive weeks of this process
with the roadmap's cohort and evidence targets. Before calling it complete, verify:

- 10 creators onboarded, 7 have streamed, and 5 remain weekly active in week four.
- No unresolved critical payment or data incident.
- Support effort per activation is trending downward.
- At least three qualified creators credibly intend to pay NT$299.
- The weekly decision notes, support tracker, interviews, and exits are retained in the
  approved private system with access controls.

Until then, report this runbook as **prepared only**.
