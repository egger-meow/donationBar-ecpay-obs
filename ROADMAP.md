# DonationBar Global Product Build Stages

Repository:

`egger-meow/donationBar-ecpay-obs`

Working branch:

`multiuser`

Final product direction:

> **DonationBar — The programmable revenue goal for live streams.**

Core product promise:

> Connect multiple creator revenue/support sources into one beautiful, programmable OBS goal bar.

The product is no longer Taiwan-first and is no longer primarily an ECPay donation platform.

ECPay becomes one revenue-source adapter.

The final system should support a global SaaS model where:

* creators connect existing revenue/support sources
* DonationBar normalizes those events
* one goal can aggregate multiple sources
* creators define weights, currencies, milestones, and actions
* OBS receives a reliable real-time goal visualization
* DonationBar charges creators through Paddle
* DonationBar does not custody creator donation revenue

## Global execution rule

Do not implement later stages early.

For every stage:

1. inspect the current repository first
2. reuse existing working code where possible
3. implement only the scope required for that stage
4. add or update tests
5. run the complete relevant test/release suite
6. update `ROADMAP.md`
7. update the project progress log
8. document architectural decisions
9. report anything requiring manual owner action

At the end of every stage create or update:

`docs/operations/OWNER_ACTIONS.md`

It must contain exact manual actions the owner must perform outside the repository.

Do not write generic instructions.

Use the exact URLs, environment variable names, webhook paths, Cloudflare bindings, Paddle product IDs, OAuth callback paths, and configuration names created by the implementation.

---

# Stage 0 — Market Wedge Validation (COMPLETED)

## Status: PROCEED (Refined Wedge)
Stage 0 market research and competitive validation was completed on 2026-08-22.

### Deliverables:
- [`GLOBAL_MARKET_ANALYSIS.md`](docs/product/GLOBAL_MARKET_ANALYSIS.md) — Comprehensive competitive analysis, user pain evidence, revenue-source scoring, pricing research, and strategic wedge evaluation.
- [`COMPETITIVE_MATRIX.md`](docs/product/COMPETITIVE_MATRIX.md) — Detailed feature comparison matrix across 8 competitor categories and 20 dimensions.
- [`PRODUCT_POSITIONING.md`](docs/product/PRODUCT_POSITIONING.md) — Finalized customer persona, problem statement, product promise, headline, frozen V1 scope, and explicit non-goals.

### Core Stage 0 Conclusions:
1. **Hypothesis Validated:** Single-source goals and standard alert boxes are 100% commoditized and free. The clear, underserved pain is multi-source revenue aggregation with programmable weighting, multi-currency normalization, and milestone automation.
2. **Initial Target Segment:** Monetized multi-platform streamers and VTubers (25–500 CCV) who simulcast or collect revenue across Twitch, YouTube, Ko-fi, and local payment providers.
3. **The 80/10 Opportunity:** Delivering 80% of Streamer.bot's goal automation power with 10% of the setup complexity (cloud-based, no-code, 5-minute OBS setup).
4. **Frozen V1 Source Scope:** Twitch (Bits & Subs), Ko-fi (Tips & Subs), Streamlabs Socket Bridge (PayPal & Super Chats), ECPay (Taiwan local), Generic Inbound Webhook, and Manual/Test Console.
5. **Pricing:** Free ($0, 1 Goal, 2 Sources) / Pro ($7.99/mo or $69/yr for unlimited sources, custom weighting, auto-currency conversion, milestone actions, goal chaining, and permanent audit history).

---

# Stage 1 — Universal Revenue Event Core (COMPLETED)

## Status: COMPLETED
Stage 1 architecture refactoring and implementation was completed on 2026-08-22.

### Deliverables:
- **Canonical Model & Normalizer**: [`lib/revenue-event.js`](lib/revenue-event.js) — pure frozen immutable model separating source event facts from downstream goal rules, strictly integer minor units with ISO 4217 multi-currency validation.
- **Source Registry**: [`lib/source-registry.js`](lib/source-registry.js) — active (`ecpay`, `webhook`, `manual`, `test`) and planned (`twitch`, `kofi`, `streamlabs`, `streamelements`, `youtube`) capabilities registry.
- **Multi-Currency System**: [`lib/money.js`](lib/money.js) — multi-currency decimals map and normalization for zero-decimal (`TWD`, `JPY`, `KRW`, etc.) and two-decimal (`USD`, `EUR`, `GBP`, etc.) currencies.
- **Source Adapters**:
  - `providers/ecpay-donation-adapter.js` — ECPay paid and return event normalizers.
  - `lib/source-adapters/generic-webhook-adapter.js` — Generic inbound webhook JSON normalizer.
  - `lib/source-adapters/manual-adapter.js` — Creator manual adjustment adapter.
  - `lib/source-adapters/test-adapter.js` — Isolated creator test console adapter.
- **Generic Webhook Handler**: [`lib/generic-webhook-handler.js`](lib/generic-webhook-handler.js) — constant-time token verification, payload normalization, error handling.
- **Database & Idempotency Layer**: [`lib/database.js`](lib/database.js) & [`migrations/20260822-create-revenue-events.sql`](migrations/20260822-create-revenue-events.sql) — PostgreSQL `revenue_events` table with partial unique index `(workspace_id, source, external_event_id)` and JSON sandbox support.
- **Endpoints in `server.js`**:
  - `POST /api/webhook/generic/:slug` — Token-authenticated generic inbound webhook.
  - `GET /api/sources` — Active sources list and capabilities metadata.
  - `GET /api/workspace/webhook-token` & `POST /api/workspace/webhook-token/rotate` — Token management.
  - `POST /api/events/manual` — Authenticated creator manual adjustment.
  - `POST /api/events/test` — Authenticated creator test event trigger.
  - `GET /api/events` — Authenticated creator revenue event history.
- **Architecture Documentation**:
  - [`REVENUE_EVENT_CORE.md`](docs/architecture/REVENUE_EVENT_CORE.md)
  - [`SOURCE_ADAPTERS.md`](docs/architecture/SOURCE_ADAPTERS.md)
  - [`GENERIC_WEBHOOK.md`](docs/architecture/GENERIC_WEBHOOK.md)
  - [`ADDING_A_SOURCE.md`](docs/architecture/ADDING_A_SOURCE.md)
  - [`OWNER_ACTIONS.md`](docs/operations/OWNER_ACTIONS.md)
- **Automated Tests**: 150 automated tests passing across 24 test suites with 100% pass rate.

---

# Stage 2 — Cloudflare Production Infrastructure

## Goal

Migrate the deployable application from the current Render-oriented Node deployment to Cloudflare Workers while preserving the existing PostgreSQL database.

Target architecture:

```text
donationbar.jjmowlab.com
        ↓
Cloudflare Worker
        ↓
Cloudflare Hyperdrive
        ↓
Existing PostgreSQL / Aiven
```

Do not migrate PostgreSQL to Supabase merely for this project.

Audit:

* Express compatibility
* static asset serving
* session implementation
* PostgreSQL connection behavior
* SSE / streaming behavior
* timers
* filesystem assumptions
* backup tooling
* migrations
* graceful shutdown assumptions
* environment configuration
* Node APIs
* email
* observability

Use Cloudflare's current Node compatibility capabilities where appropriate.

Avoid rewriting the application framework unless necessary.

Prepare:

* Worker entry point
* Wrangler configuration
* environment separation
* secrets configuration
* Hyperdrive binding
* production/staging settings
* deployment scripts
* health checks
* production domain configuration documentation

Keep migrations and backups runnable from an appropriate controlled environment if they should not execute inside Workers.

### Done Criteria

Stage 2 is complete only when:

* application runs successfully in Cloudflare Workers staging
* production Node/Express behavior needed by the app is verified
* PostgreSQL works through Hyperdrive or a documented safe alternative
* authentication works
* sessions work
* event history works
* OBS real-time delivery works
* test events work
* no request depends on writable local filesystem
* production secrets are not committed
* staging health checks pass
* deployment is reproducible
* existing tests remain green
* owner has an exact manual Cloudflare setup checklist

`OWNER_ACTIONS.md` must tell the owner exactly how to:

* create/connect the Worker
* configure Hyperdrive
* connect the existing database
* set each required secret
* configure Workers Builds if used
* configure `donationbar.jjmowlab.com`
* configure DNS
* verify HTTPS
* perform staging deployment
* perform production deployment

Do not mark Stage 2 done until an actual Worker staging deployment is exercised.

---

# Stage 3 — The Goal Engine

## Goal

Build the core product that makes DonationBar worth existing:

> One programmable goal combining multiple revenue/support sources.

A creator must be able to create a Goal with:

* name
* target
* display currency
* starting amount
* active period
* selected revenue sources

Each source can optionally define:

* conversion rule
* fixed contribution value
* percentage weighting
* currency conversion behavior
* inclusion/exclusion rules

Examples:

```text
YouTube Super Chat:
actual monetary value

Twitch Bits:
100 Bits = $1 goal contribution

Tier 1 Twitch Sub:
+$2.50

Tier 2:
+$5

Tier 3:
+$12

Manual:
custom amount
```

Implement milestone rules.

Example:

```text
25%
→ animation A

50%
→ animation B
→ webhook

75%
→ animation C

100%
→ celebration
→ webhook
→ optionally activate next goal
```

Actions should initially remain intentionally limited.

Possible V1 actions:

* visual animation
* sound
* Generic Webhook
* automatically activate another Goal

Do not build a full Streamer.bot competitor.

The Goal Engine must be understandable by a normal streamer.

### Done Criteria

Stage 3 is complete only when:

* one Goal can consume events from multiple adapters
* source weighting works
* multi-currency behavior is deterministic
* duplicate events do not double-increment goals
* milestone crossing is detected exactly once
* milestone actions execute exactly once
* goal completion is persisted
* optional next-goal activation works
* manual adjustment exists with audit history
* goal reset exists
* event history explains why the goal changed
* creator can test every milestone without real money
* all critical rules have automated tests

The core UI must allow a non-technical creator to understand:

> What contributes to this goal?

and:

> What happens at each milestone?

without reading documentation.

---

# Stage 4 — OBS Experience

## Goal

Make DonationBar's visible output exceptionally good.

The bar is not merely a technical visualization.

It is the product surface viewers see.

Build a focused OBS experience including:

* beautiful default goal bar
* transparent OBS background
* responsive scaling
* long text handling
* customizable title
* current value
* target value
* percentage
* configurable display currency
* milestone indicators
* milestone animations
* completion animation
* alert queue safety
* reconnect behavior
* connection state
* offline recovery
* test event
* test milestone
* replay visualization
* browser-source URL copying
* recommended OBS dimensions

Offer a small number of excellent themes rather than dozens of mediocre themes.

Prioritize:

1. reliability
2. readability
3. visual quality
4. customization

in that order.

### Done Criteria

Stage 4 is complete only when:

* OBS Browser Source setup works without developer assistance
* overlay reconnects after network interruption
* long creator names/messages cannot break layout
* small and large OBS viewport tests pass
* transparent background works
* milestone animations render correctly
* goal completion renders correctly
* source events update the overlay in real time
* reconnect does not double-play completed events
* creator can trigger safe test events
* creator-facing connection diagnostics exist
* setup documentation contains screenshots or equivalent clear instructions
* real OBS verification has been performed, not only browser simulation

Target:

> New creator reaches a working test Goal inside OBS in under 10 minutes.

---

# Stage 5 — Real Global Source Integrations

## Goal

Connect enough real-world revenue sources that DonationBar's multi-source promise becomes genuine.

Implement the highest-value sources identified in Stage 0.

Initial target set:

* Twitch
* YouTube
* Ko-fi
* ECPay
* Generic Webhook
* Manual/Test

Evaluate Streamlabs and StreamElements during implementation and include them if their APIs, access model, and maintenance cost make them appropriate for V1.

For every source:

* authentication/setup
* event verification
* normalization
* idempotency
* reconnection/retry
* diagnostics
* test mode where possible
* removal/revocation
* clear setup UI

Twitch should evaluate at minimum:

* Bits
* subscriptions

YouTube should evaluate at minimum:

* Super Chats
* memberships

Ko-fi should evaluate monetary support events.

Do not build payment processing.

DonationBar consumes events from platforms/providers.

Money stays with the creator's existing platform/provider.

### Done Criteria

Stage 5 is complete only when:

* at least 3 real external sources beyond Manual/Test can feed the same Goal
* Twitch works with at least one real supported revenue event
* YouTube works with at least one real supported revenue event
* ECPay continues working
* Generic Webhook works
* source connection UI exists
* source disconnect/reconnect works
* expired credentials fail clearly
* duplicate events do not double-count
* source outages cannot corrupt totals
* a single Goal can receive events from at least two different real sources during one session
* source-specific errors are diagnosable

At least one real cross-source Goal must be demonstrated end-to-end.

Example:

```text
Twitch contribution
+
YouTube contribution
→ same Goal
→ same OBS bar
```

---

# Stage 6 — Global SaaS, Paddle, Onboarding, and Launch Readiness

## Goal

Turn the working tool into an actual globally sellable SaaS product.

Replace platform subscription billing with Paddle.

Important separation:

```text
Creator → Paddle → DonationBar SaaS subscription

Viewer revenue → creator's connected revenue source
```

DonationBar must never route creator donation revenue through Paddle.

Implement:

* Paddle Checkout
* Paddle webhook verification
* subscription states
* trial if selected
* monthly plan
* yearly plan
* cancellation
* failed payment
* renewal
* entitlement enforcement
* pricing page
* customer billing management
* global currency-friendly checkout
* production billing diagnostics

Recommended initial hypothesis:

```text
Free
Pro ≈ US$7.99/month
Pro yearly ≈ US$69/year
```

Do not hardcode these assumptions unnecessarily.

Build public:

* landing page
* pricing
* features
* documentation
* Terms
* Privacy
* Refund policy
* support/contact path

Landing positioning:

> One bar. Every revenue source. Any rule.

or the final positioning validated in Stage 0.

Onboarding must guide:

```text
Sign up
→ create Goal
→ connect source
→ add OBS
→ run test
→ go live
```

### Done Criteria

Stage 6 is complete only when:

* Paddle sandbox subscription works end-to-end
* Paddle webhook verification works
* subscription renewal works
* failed subscription payment is handled
* cancellation works
* entitlements change correctly
* monthly and yearly prices are configuration-backed
* Free → Pro upgrade works
* paid → cancelled behavior works
* landing page exists
* pricing page exists
* Terms exist
* Privacy Policy exists
* Refund Policy exists
* support path exists
* onboarding is self-service
* mobile landing/payment UX works
* production domain is configured
* Google OAuth production callback works
* production monitoring exists
* database backup/restore has been rehearsed
* owner receives an exact Paddle go-live checklist

`OWNER_ACTIONS.md` must include exact instructions for:

### Paddle

* account verification
* product creation
* monthly price creation
* yearly price creation
* client token
* API key
* webhook destination
* webhook secret
* domain approval
* default payment link
* sandbox testing
* live catalog recreation
* live credential replacement

### Cloudflare

* production Worker
* Hyperdrive
* secrets
* production domain
* DNS
* deployment

### Google

* production OAuth origin
* production callback URL

Do not call Stage 6 done if the owner cannot follow the document line-by-line and complete the external-account setup.

---

# Stage 7 — Real User Proof and Public Launch Gate

## Goal

Take DonationBar from technically launchable to genuinely released.

This stage must end in:

> **Public production release.**

Do not postpone release because additional features could be built.

Use external users who have never touched the repository.

Test the complete flow:

```text
Visit donationbar.jjmowlab.com
→ understand product
→ sign up
→ create Goal
→ connect revenue source
→ configure Goal
→ add OBS Browser Source
→ trigger test contribution
→ receive a real contribution/event
→ Goal updates
→ milestone behaves correctly
→ creator understands pricing
→ optionally subscribe through Paddle
```

Recruit at least several external streamers.

Observe without taking control of their computer.

Record:

* activation time
* setup failures
* confusing UI
* source connection failures
* OBS failures
* event latency
* missing integrations
* pricing reactions
* willingness to pay
* reasons not to use the product

Fix only launch-blocking or severe activation issues.

Do not start another broad feature cycle.

Then complete the production launch.

### Final Done Criteria

Stage 7 is complete only when:

#### Product

* production site is publicly accessible
* signup is publicly accessible
* at least one real creator outside the development process completes onboarding
* at least one real external revenue event updates a real OBS Goal
* at least one Goal receives multiple source types or the V1 cross-source promise has been realistically demonstrated
* core Goal configuration is self-service
* error states are actionable
* no developer database edits are required

#### Reliability

* production health checks pass
* no confirmed event is silently lost in the tested flows
* duplicate events do not double-count
* OBS reconnect works
* critical errors are observable
* credentials do not appear in public responses/logs
* backup and restore procedures are documented and tested

#### Billing

* Paddle production account is approved
* production domain is approved
* live Paddle product/prices exist
* live Checkout opens
* live webhook is configured
* one real live subscription or controlled live-purchase validation has been completed
* cancellation/recovery path is documented

#### Website

Public site contains:

* product explanation
* working signup
* pricing
* documentation
* Terms
* Privacy Policy
* Refund Policy
* support/contact
* status/incident communication path where appropriate

#### Operations

* `OWNER_ACTIONS.md` has no unresolved launch blocker
* production secrets are configured
* production OAuth works
* Cloudflare production deployment works
* Aiven/Postgres production connection works
* monitoring works
* backup process works

#### Release

* production version/tag exists
* release notes exist
* README matches the actual product
* old Taiwan-only/ECPay-only positioning is removed
* `ROADMAP.md` marks Public Launch complete

## FINAL RELEASE RULE

Once all Stage 7 Done Criteria pass:

> **Do not delay public promotion for additional features.**

The product is considered launched.

At that point the owner can immediately begin:

* Reddit launch posts
* streamer community outreach
* X/Twitter posts
* Threads
* Discord communities
* direct streamer outreach
* Product Hunt if appropriate
* demo videos
* SEO content
* Twitch/YouTube creator outreach
* referral recruitment

Create:

`docs/launch/PROMOTION_PLAYBOOK.md`

with:

* target communities
* launch positioning
* demo assets required
* suggested posts
* outreach message
* launch-week metrics
* feedback capture
* first 30-day growth experiments

The agent must clearly state:

> **DonationBar is technically and operationally ready for public promotion.**

or list the exact remaining blockers.

No ambiguous "almost ready" status is allowed.

---

# Overall Definition of Success

These stages do not require DonationBar to already have product-market fit.

They require DonationBar to become a real product.

The project succeeds at the end of this build sequence when:

> DonationBar is publicly deployed, globally usable, connected to real creator revenue sources, able to combine those sources into a programmable OBS Goal, able to charge SaaS subscriptions through Paddle, and ready to be actively promoted to streamers.

Traction comes after shipping.

Public launch is a required deliverable, not a reward for already having traction.
