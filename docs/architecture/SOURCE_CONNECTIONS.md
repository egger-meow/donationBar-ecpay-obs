# Workspace Source Connections Model

## Purpose

To manage multi-platform creator integrations (Twitch, Ko-fi, ECPay, Generic Webhook) cleanly without overloading the billing-specific `payment_providers` table, Donatio utilizes a dedicated `workspace_source_connections` entity.

---

## 1. Schema & Data Model

```sql
CREATE TABLE IF NOT EXISTS workspace_source_connections (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL, -- 'twitch', 'kofi', 'ecpay', 'webhook'
  external_account_id VARCHAR(128),
  display_name VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'disconnected', 
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_code VARCHAR(64),
  credential_reference VARCHAR(128),
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_workspace_source UNIQUE (workspace_id, source)
);

CREATE INDEX IF NOT EXISTS idx_source_connections_lookup ON workspace_source_connections(workspace_id, status);
```

---

## 2. Connection Lifecycle States

| State | Description | Transition Triggers |
|---|---|---|
| `disconnected` | Source is unlinked; no events processed | Initial state, or user clicks "Disconnect" |
| `connecting` | OAuth in-flight or verification pending | Redirect to provider auth |
| `connected` | Healthy, authenticated, receiving events | Successful OAuth / token verification |
| `degraded` | Intermittent errors or rate limiting | Provider errors detected in webhook intake |
| `reauthorization_required` | Token revoked or refresh token expired | Twitch token refresh failure (HTTP 401) |
| `error` | Fatal configuration or capability failure | Invalid credentials or unresolvable error |

---

## 3. Credential Storage & Security

- **Encryption at Rest**: OAuth access tokens, refresh tokens, and webhook secrets are encrypted with AES-256-GCM using `CREDENTIAL_ENCRYPTION_KEY`.
- **Zero Client Leakage**: Sensitive credentials and tokens are strictly excluded from API responses, client dashboards, SSE event streams, and OBS payloads.
- **Durable History**: Disconnecting a source revokes the provider subscription and sets `status = 'disconnected'`, but **strictly preserves** historical `revenue_events` and `goal_contributions`.
