# DonationBar Taiwan-First Roadmap

Status: execution baseline, 2026-07-11. This is authoritative for priorities; code and tests are authoritative for shipped behavior.

## 1. Current repository assessment

Shipped in code: Google OAuth state validation, PostgreSQL production sessions, workspace-scoped routes, separate ECPay donation and platform recurring billing, signature verification, idempotency, trial/paywall/cancellation, encrypted provider credentials, same-origin protection including public order creation, rate limits/security headers including an enforced ECPay-compatible CSP, health checks, graceful shutdown, migrations, Docker/CI configuration, reconnecting SSE overlays, structured request/error logging with a fixed-vocabulary external alert webhook, a redacted staging-preflight CLI check, a recurring-subscription callback lifecycle test suite (success/failure/replay/duplicate), P1 "Guided activation" timestamp/funnel measurement, configuration-backed public closed-beta pricing, and an authenticated creator data export. Donation and platform payment-history persistence enforce positive integer TWD money; database/email paths no longer log donor PII, provider payment references, fingerprints, certificate content, or raw provider errors; public progress/SSE payloads use opaque donation alert IDs rather than provider references; public SSE clients cannot receive owner webhook diagnostics; provider callbacks have an isolated rate-limit budget. A source audit confirms one registered workspace webhook and idempotent fallback routes. The suite currently contains 74 tests.

The P1 "Guided activation" row below is **not** fully proven: the checklist and funnel/activation-time measurement are built, but neither has been verified against real staging or a real OBS Browser Source — only sandbox/local testing. The delivered-live-alert milestone remains a documented event-order heuristic, not proof of visual observation.

P1 "Beta operations" now has a prepared support/interview/weekly-review/exit runbook,
but it has not operated with a real cohort; the required four weeks of support and
retention evidence remain open.

The P0 Legal/data baseline now has a self-service creator workspace export and a
deletion-request operating boundary, but legal/accounting approval of retention,
subprocessors, tax/e-invoice, identity verification, and deletion handling remains
required before accepting customers.

The current production npm dependency graph has a clean `npm audit --omit=dev` result
(2026-07-11); repeat the audit on every dependency change and before release.

PostgreSQL migration/backup/restore has been rehearsed against a real **local** PostgreSQL 17 instance (2026-07-11, see [MIGRATION_GUIDE.md](docs/migration/MIGRATION_GUIDE.md) Section 7) — not staging/hosted, but a real database engine, not JSON sandbox mode. The rehearsal found and fixed two real bugs that would have broken `npm run migrate` against any genuinely fresh production database (an unguarded legacy-data query, and a wrong file path), plus documented a real limitation of `npm run restore` (it recreates what the backup contains but doesn't remove newer unrelated objects). Monitoring alert delivery has similarly been exercised against a real local HTTP listener, not a real vendor endpoint (see `docs/operations/MONITORING_AND_INCIDENT_RESPONSE.md` Section 7).

Not proven in real staging or production: all of the above against a real hosted database and domain, production-domain OAuth, ECPay initial/recurring callbacks and failures, callback replay, cancellation, container CI outcome, OBS/browser coverage, and monitoring alert delivery against a real vendor endpoint. The service is not production-ready.

## 2–5. Market, customer, gap, positioning

- **Market:** Taiwan creators need familiar local payments, Traditional Chinese onboarding/support, and direct payment-to-OBS interactions.
- **Initial customer:** Twitch/YouTube creators with about 20–500 concurrent viewers, existing monetization, no engineer, and willingness to configure ECPay.
- **Gap:** global alert tools under-serve local payment workflows; gateways do not provide the complete creator/OBS experience.
- **Position:** “The reliable Taiwan payment-to-OBS layer.” DonationBar does not custody viewer funds.

## 6. Build now

| Priority / deliverable | Why and impact | Difficulty | Dependency | Definition of done |
|---|---|---|---|---|
| P0 Staging release proof | Removes payment/data-loss launch risk | High | Hosted Postgres, domain, provider sandbox | Donation and recurring success/failure/replay/cancel, migrations, rollback, backup and restore have redacted evidence |
| P0 Observable operations | Detects and shortens incidents | Medium | Monitoring vendor | Request IDs and safe structured errors exist; readiness, callback and 5xx alerts are exercised |
| P0 Legal/data baseline | Required before real users and money | Medium | Taiwan legal/accounting review | Terms/privacy, retention, subprocessors, support, tax/e-invoice and incident ownership are approved |
| P1 Guided activation | Raises first-alert completion | Medium | Stable staging | Checklist covers provider, test payment, OBS and live alert; funnel and activation time are measured |
| P1 Beta operations | Converts feedback into evidence | Low | 10–20 recruits | Support SLA, interview cadence, weekly metrics review and exit process operate four weeks |
| P1 Paid conversion | Tests willingness to pay and creates MRR | Medium | Stable billing and plan policy | Pricing/limits visible; trial, renewal failure, upgrade/cancel and access states pass tests and staging |
| P2 Core retention slice | Improves repeat use after evidence | Medium | Activation baseline | Selected goal/top/latest/replay/TTS slice has tests, OBS verification and usage tracking |

## 7. Validate later

| Candidate | Why and impact | Difficulty | Dependency | Definition of done |
|---|---|---|---|---|
| Provider adapter | Enables demand-led expansion without widget coupling | High | 5 qualified requests for provider two | One canonical donation event supports two sandbox providers |
| NewebPay or LINE Pay | May lift creator activation/conversion | High | Interview and lost-conversion data | Provider wins scored demand/compliance/cost review and sandbox proof |
| Advanced TTS/moderation/templates | Potential retention and plan value | Medium–High | Retained cohort demand | Prototype reaches a pre-agreed usage/retention threshold |
| Agency/multi-channel | Higher ARPU | High | 3 paying agency prospects | Workflow, permissions, pricing and support cost validated |

## 8. Reject for now

| Item | Why and impact | Difficulty | Dependency | Definition of done |
|---|---|---|---|---|
| International expansion | Dilutes Taiwan learning and adds tax/provider scope | High | Taiwan profitability | Outside backlog until Taiwan metrics hold two quarters |
| Custody/pooling donations | Adds reconciliation, trust and regulatory risk | High | Legal model | No build; creator-owned settlement remains a constraint |
| OBS dock, Stream Deck, public API | Weak evidence versus activation work | High | 30 retained paid workspaces plus demand | Reconsider only when threshold is documented |
| Broad monolith rewrite | High regression risk, no direct user value | High | Measured scaling constraint | Allow only focused extraction tied to a proven bottleneck |

## 9. Production blockers

Release stays blocked until staged payment evidence exists; migrations and restore are rehearsed; alerts are exercised; OAuth uses the real domain; legal/business/tax/privacy decisions are signed off; CI including container build is green; and mobile/desktop plus exact transparent OBS viewport checks are recorded. Explicitly review duplicate webhook routes, sessions, CSRF, rate limits, headers, dependency audit, retention/deletion/export, rollback, and provider restrictions.

## 10–11. Phases and first 12 weeks

| Weeks / outcome | Why and impact | Difficulty | Dependency | Definition of done |
|---|---|---|---|---|
| 1–2 Launch-evidence gate | Prevents beta payment/data incidents | High | Hosting and sandbox credentials | Every P0 exercise has evidence, owner, rollback and pass/fail |
| 3–4 Activation-ready beta | Enables nontechnical self-install | Medium | Gate passed | 5 activations complete; median test-alert time measured; critical Traditional Chinese path reviewed |
| 5–6 10–20 streamer cohort | Establishes workflow/support evidence | Medium | Recruitment | 10 onboard, 7 stream, blockers severity-ranked weekly |
| 7–8 Paid offer experiment | Tests value and price | Medium | Retained users | 5 qualified users see offer; conversion/objections recorded; billing lifecycle passes |
| 9–10 One retention release | Avoids feature sprawl | Medium | Usage/interview evidence | One evidence-backed interaction ships with tests, OBS proof and usage tracking |
| 11–12 Public-launch decision | Makes launch evidence-based | High | 4 stable beta weeks | Go/no-go covers reliability, activation, retention, conversion, support, legal, restore and economics |

## 12. Pricing and profitability

Pricing experiment: 30-day free closed beta; constrained Starter/free setup experience; Pro hypothesis NT$299/month; Agency hypothesis NT$899 only after validation. The current NT$70 configuration is a beta/validation price, not an evidence-backed public price.

ECPay periodic billing requires eligible merchant arrangements and fixed TWD periodic charges; contracted fees must be confirmed before publishing margins ([recurring documentation](https://developers.ecpay.com.tw/2868/), [eligibility guidance](https://support.ecpay.com.tw/25120/)).

Illustrative, not forecast: 10 Pro users = NT$2,990 MRR; 34 = NT$10,166. With assumed NT$8,000 monthly fixed cost and 85% contribution after fees/variable support, break-even is about 32 Pro users. Replace assumptions with invoices, contract fees, hosting measurements and support hours.

Costs: hosting/database/backups, monitoring/email, payment fees, support, accounting/tax/e-invoice, legal/privacy, and incidents. Path: founder-supported cohort → repeatable self-service → 32+ retained Pro-equivalent accounts → expand only from demonstrated margin.

## 13. Beta recruitment

Recruit via the confirming professional streamer, Taiwan Twitch/YouTube communities, creator managers, and referrals. Offer 30 free days, assisted setup, and a feedback agreement—not lifetime discounts. Screen streaming frequency, monetization, ECPay eligibility, and pain. Observe onboarding; check in week one; interview biweekly and at exit.

Success threshold: 10 activate, 7 stream, 5 remain weekly active in week four, no unresolved critical payment/data incident, support effort trends down, and 3 credibly intend to pay NT$299.

## 14. Metrics

- OAuth → workspace → provider → test donation → OBS → live alert; median time to each.
- Payment success, callback latency, duplicate/replay and unmatched-event rates.
- Weekly active streams; week-1/week-4 and paid-month retention.
- Trial conversion, MRR, failed renewals, voluntary/involuntary churn.
- Support minutes/tickets per activation and incident recovery time.

## 15–16. Risks

| Risk | Why and impact | Difficulty | Dependency | Definition of done |
|---|---|---|---|---|
| Callback edge cases | Lost/duplicate money events | High | Provider access | Failure/replay/out-of-order suite and staging evidence pass |
| Tenant/secret exposure | Existential trust impact | High | Security review | Authorization/encryption tests pass; sensitive values absent from logs |
| OBS/network instability | Fails at moment of value | Medium | OBS test setup | Reconnect, viewport, transparent background, long-text and interruption checks pass |
| Provider dependence | Eligibility and outage risk | High | Demand data | Incident/status playbook exists; adapter waits for validated choice |
| Low willingness to pay | Invalid economics | Medium | Real price conversations | Qualified retained users see offer; responses recorded |
| Support-heavy setup | Prevents scale | Medium | Funnel data | Setup time/support targets set after first five and then met |
| Legal/tax gaps | Can block charging | High | Professional advice | Written entity, tax/e-invoice, privacy, retention and restriction decisions stored |

## 17. Immediate next 10 actions

Each action inherits the rationale, impact, difficulty, dependency and DoD of its referenced row.

1. Provision staging Postgres, HTTPS domain, secrets, and encrypted backups.
2. Run migrations; rehearse documented rollback and full restore.
3. Exercise Google OAuth on the production-style domain.
4. Exercise ECPay donation success, bad signature, duplicate, replay, and failure.
5. Exercise recurring initial payment, renewal, failed renewal, and cancellation.
6. Install monitoring and test readiness/callback/5xx alerts.
7. Obtain Taiwan legal/accounting review for terms, privacy, retention, tax/e-invoice, and merchant eligibility.
8. Repair the Traditional Chinese activation path and measure the onboarding checklist.
9. Recruit first five design partners, then expand to 10–20.
10. Hold the week-2 release gate before paid cohort or retention work.
