Inspect the current `multiuser` branch of `donationBar-ecpay-obs`.

Do not implement features yet.

Create a practical `ROADMAP.md` for turning this project into:

> 台灣最強的實況主在地金流 + OBS 斗內互動平台，並且能真正獲利。

## Core market insight

A professional streamer confirmed that Taiwanese streamers have a real need for more diverse local payment options.

Current global tools often do not fit Taiwan well enough in:

* local payment methods
* Traditional Chinese UX
* local onboarding and support
* direct integration between payments and OBS interactions

Our first goal is not worldwide expansion.

Our first goal is:

> 第一刀：台灣做到最強，打通市場，取得真實使用者與訂閱收入。

## Product direction

Evolve the project from:

> ECPay donation bar for OBS

into:

> A Taiwan-first creator monetization platform connecting local payment methods to OBS alerts, goals, TTS, leaderboards, notifications, and stream interactions.

Possible payment providers include:

* ECPay
* NewebPay
* LINE Pay
* ATM virtual accounts
* convenience-store payments
* bank transfer reconciliation

Do not assume all providers must be built immediately.

## Roadmap requirements

First audit the repository and identify:

* what already works
* what is incomplete
* what is unsafe for production
* what should be removed or delayed
* what blocks real streamers from using it
* what blocks us from charging subscriptions

Then build the roadmap in these stages:

### 1. Production foundation

Make the existing multi-user system safe and reliable enough for real users.

Focus on:

* authentication and sessions
* workspace isolation
* payment credential encryption
* webhook verification and idempotency
* database migrations
* logging and monitoring
* tests
* backups
* deployment
* privacy policy and terms

### 2. Taiwan closed beta

Target 10–20 real Taiwanese streamers.

Minimum useful product:

* simple onboarding
* connect ECPay
* donation page
* OBS browser source
* test donation
* alert box
* donation goal
* latest and top supporter
* event history
* replay alert
* basic TTS
* Traditional Chinese UI
* clear setup documentation

Define how to recruit users, gather feedback, and decide whether the beta is successful.

### 3. Paid public launch

Add only what is needed to turn the beta into a paid SaaS:

* pricing plans
* free trial
* subscription billing
* plan limits
* upgrade, downgrade, and cancellation
* product analytics
* onboarding checklist
* support workflow
* polished landing and pricing pages

Keep viewer donations separate from the platform subscription payment.

Prefer that donation money goes directly to the streamer’s own payment account.

### 4. Local payment expansion

Design a payment provider adapter layer so ECPay, NewebPay, LINE Pay, and future providers output the same internal donation event.

Do not connect OBS widgets directly to individual payment providers.

Prioritize new providers based on:

* actual streamer demand
* payment conversion impact
* implementation difficulty
* compliance risk
* maintenance cost
* revenue potential

### 5. Retention and market leadership

Only after beta evidence, consider:

* advanced TTS
* alert moderation
* GIF and video alerts
* custom CSS
* overlay templates
* leaderboards
* Discord and LINE notifications
* OBS dock
* Stream Deck integration
* agency accounts
* multiple channels
* analytics
* API and webhooks

Prioritize features that improve activation, retention, paid conversion, or referrals.

## Business model

Evaluate a subscription model such as:

* Free
* Pro around NT$199–399/month
* Studio or Agency around NT$699–1,499/month

Do not blindly accept these prices.

Recommend pricing based on value, competitor pricing, infrastructure cost, support burden, and Taiwanese creator purchasing power.

Estimate:

* first 10 paying users
* first NT$10,000 MRR
* break-even point
* main operating costs
* realistic path to profitability

## Required output

Create `ROADMAP.md` containing:

1. Current repository assessment
2. Taiwan market opportunity
3. Initial target streamer segment
4. Core competitive gap
5. Product positioning
6. Features to build now
7. Features to validate later
8. Features to reject for now
9. Production blockers
10. Phased roadmap
11. First 12-week execution plan
12. Pricing and profitability plan
13. Beta recruitment strategy
14. Product metrics
15. Technical risks
16. Business risks
17. Immediate next 10 actions

Every roadmap item must include:

* why it matters
* expected user or revenue impact
* implementation difficulty
* dependency
* definition of done

Be brutally practical.

Do not produce generic startup advice.

Do not turn this into a worldwide roadmap.

The final objective is:

> Win Taiwan first, prove people will pay, reach profitability, and only then prepare for international expansion.
