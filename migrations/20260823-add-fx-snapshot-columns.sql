BEGIN;

-- Add explicit FX snapshot columns to goal_contributions
ALTER TABLE goal_contributions
  ADD COLUMN IF NOT EXISTS fx_provider VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fx_timestamp TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS fx_pair VARCHAR(20);

COMMIT;
