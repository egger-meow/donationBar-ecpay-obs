BEGIN;

CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
  source VARCHAR(50) NOT NULL,
  source_event_type VARCHAR(50) NOT NULL,
  external_event_id VARCHAR(255),
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  amount_minor INTEGER,
  currency VARCHAR(3),
  quantity INTEGER,
  tier VARCHAR(50),
  supporter_name VARCHAR(255),
  supporter_id VARCHAR(255),
  message TEXT,
  is_synthetic BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_events_workspace ON revenue_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_revenue_events_source ON revenue_events(workspace_id, source);
CREATE INDEX IF NOT EXISTS idx_revenue_events_created_at ON revenue_events(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_events_external_id
  ON revenue_events (workspace_id, source, external_event_id)
  WHERE external_event_id IS NOT NULL;

ALTER TABLE user_workspaces ADD COLUMN IF NOT EXISTS generic_webhook_token VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_generic_webhook_token
  ON user_workspaces (generic_webhook_token)
  WHERE generic_webhook_token IS NOT NULL;

COMMIT;
