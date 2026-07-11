# Data Access and Deletion Operations

Status: implementation and operating procedure prepared, 2026-07-11. This does **not**
complete the ROADMAP.md P0 Legal/data baseline: retention periods, legal holds,
subprocessors, identity-verification policy, tax/e-invoice obligations, and deletion
timelines still require qualified Taiwan legal/accounting review.

## Creator data export

An authenticated creator can download `GET /account/export` from the admin-page
**匯出我的資料** link. The endpoint only reads workspaces returned by
`getUserWorkspaces(session.userId)` and returns an attachment with `Cache-Control:
no-store, private`.

The export includes the creator's basic account profile, subscription state (without
ECPay references), each owned workspace/settings, a boolean indicating ECPay setup, and
the workspace's donation records. It intentionally excludes:

- Provider credentials, credential envelopes, payment-provider IDs, `tradeNo`, callback
  data, ECPay merchant trade numbers, and payment history.
- Password hashes, OAuth provider IDs, sessions, device fingerprints, audit-log metadata,
  or internal operational notes.
- Workspaces not owned by the signed-in creator.

Before sending any manual export, first direct the verified creator to this feature. If
it fails, record a non-sensitive ticket and verify identity through the approved support
process; never attach a database dump or copy credentials/payment payloads into email.

## Deletion and correction requests

There is deliberately **no self-service account deletion endpoint**. An immediate delete
could conflict with an active ECPay recurring authorization, payment/reconciliation
records, fraud/security evidence, and retention duties that are not yet legally defined.

Until the legal/data-baseline gate is closed:

1. Acknowledge the request using the beta support process; do not promise a deletion
   deadline or outcome.
2. Verify the requester and identify active subscription/cancellation state without
   exposing payment references.
3. Escalate privacy, payment, security, or legal-hold questions to the accountable
   privacy/business owner.
4. Record only the request ID, decision, legal basis, and completion timestamp in the
   approved private tracker; keep requester details outside this repository.
5. If deletion is approved, use a reviewed, reversible operational procedure and verify
   the result. Do not improvise SQL deletes against production payment data.

## Required review before public launch

The privacy owner must document: data categories and controller roles, processor list,
retention/deletion schedule, identity-verification method, access/correction/deletion
SLA, handling of donor data in creator exports, legal-hold exceptions, backup expiry,
and the relationship between subscription cancellation and account closure. Update the
privacy policy and this runbook only after that review is approved.
