# Alert Exercise Evidence Template

Use one copy of this template per exercise. Store filled-in copies wherever the team keeps operational evidence (do not commit real credentials, donor names, or payment payloads into this repository — redact before saving). Definitions of the signals below come from [MONITORING_AND_INCIDENT_RESPONSE.md](MONITORING_AND_INCIDENT_RESPONSE.md).

No exercise has been run yet as of 2026-07-11; this template is unused until one is.

## Exercise record

- **Date/time (UTC):**
- **Exercise type:** one of `readiness-failure` / `callback-failure` / `5xx-spike`
- **Environment:** staging or production (never run signature/decryption failure drills against live ECPay production credentials)
- **Operator:**

## Simulation method

Describe exactly how the failure was induced, e.g.:
- Readiness failure: stop/block the Postgres connection the app uses and call `GET /health/ready`.
- Callback failure: POST to `/webhook/:slug` with a deliberately wrong `MerchantID`, or a syntactically invalid `Data` field, using sandbox credentials only.
- 5xx spike: replay a batch of malformed requests against a non-payment route in staging to exercise your 5xx-rate alert without touching money-handling routes.

## Expected signal

- Expected HTTP status:
- Expected log line / reason string (per MONITORING_AND_INCIDENT_RESPONSE.md Section 4):
- Expected severity (Section 5):

## Observed signal

- Observed HTTP status:
- Observed log line / reason string:
- Time signal first appeared in logs (UTC):
- Time alert fired (UTC) — leave blank and note "no delivery path" if this exercise is only testing the in-app log, per current Gaps in MONITORING_AND_INCIDENT_RESPONSE.md Section 7:
- Time acknowledged (UTC):

## Timing

- Time to detect (signal appears → someone notices):
- Time to acknowledge (notice → first response action):
- Time to resolve (first response → confirmed back to normal):

## Result

- [ ] Signal matched expectation
- [ ] False positive (fired without real failure)
- [ ] False negative (real failure, no signal)
- Notes:

## Evidence

- Log excerpt (redact donor names, amounts, trade numbers, and any credential-shaped values before pasting):
- Screenshot/link (store outside this repository if it contains any real workspace data):

## Sign-off

- Reviewed by:
- Follow-up actions filed (link):
