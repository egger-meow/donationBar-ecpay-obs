BEGIN;

-- Drop non-unique index if it exists
DROP INDEX IF EXISTS idx_goals_workspace_active;

-- Create partial unique index enforcing exactly at most one active goal per workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_goals_workspace_active
  ON goals (workspace_id)
  WHERE is_active = TRUE;

COMMIT;
