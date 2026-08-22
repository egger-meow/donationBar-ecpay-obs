BEGIN;

-- 1. Goals Table
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  target_minor BIGINT NOT NULL CHECK (target_minor > 0),
  display_currency VARCHAR(3) NOT NULL DEFAULT 'TWD',
  starting_amount_minor BIGINT NOT NULL DEFAULT 0,
  current_amount_minor BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  epoch INTEGER NOT NULL DEFAULT 1,
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  activated_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  next_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_workspace ON goals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_goals_workspace_active ON goals(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(workspace_id, status);

-- 2. Goal Source Rules Table
CREATE TABLE IF NOT EXISTS goal_source_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
  source VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rule_type VARCHAR(50) NOT NULL DEFAULT 'monetary_passthrough',
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_goal_source_rules UNIQUE (goal_id, source)
);

CREATE INDEX IF NOT EXISTS idx_goal_rules_goal ON goal_source_rules(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_rules_workspace ON goal_source_rules(workspace_id);

-- 3. Goal Contributions Table (Auditable log of how revenue events affect goals)
CREATE TABLE IF NOT EXISTS goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
  revenue_event_id UUID REFERENCES revenue_events(id) ON DELETE SET NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  source VARCHAR(50) NOT NULL,
  source_event_type VARCHAR(50) NOT NULL,
  source_amount_minor BIGINT,
  source_currency VARCHAR(3),
  source_quantity INTEGER,
  source_tier VARCHAR(50),
  rule_type VARCHAR(50) NOT NULL,
  fx_rate NUMERIC(18, 8),
  fx_rate_provenance VARCHAR(50),
  contribution_minor BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  supporter_name VARCHAR(255),
  message TEXT,
  is_synthetic BOOLEAN DEFAULT FALSE,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal ON goal_contributions(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_contributions_workspace ON goal_contributions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_goal_contributions_created ON goal_contributions(goal_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_goal_contributions_idempotency
  ON goal_contributions (goal_id, revenue_event_id)
  WHERE revenue_event_id IS NOT NULL;

-- 4. Goal Milestones Table
CREATE TABLE IF NOT EXISTS goal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
  threshold_percent INTEGER NOT NULL CHECK (threshold_percent >= 1 AND threshold_percent <= 100),
  label VARCHAR(100),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  visual_action BOOLEAN NOT NULL DEFAULT TRUE,
  sound_action BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_action_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_goal_milestones_threshold UNIQUE (goal_id, threshold_percent)
);

CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON goal_milestones(goal_id);

-- 5. Goal Milestone Triggers Table (Tracks exactly-once trigger per epoch)
CREATE TABLE IF NOT EXISTS goal_milestone_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES goal_milestones(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
  epoch INTEGER NOT NULL DEFAULT 1,
  threshold_percent INTEGER NOT NULL,
  triggered_by_contribution_id UUID REFERENCES goal_contributions(id) ON DELETE SET NULL,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_goal_milestone_triggers UNIQUE (goal_id, epoch, threshold_percent)
);

CREATE INDEX IF NOT EXISTS idx_goal_milestone_triggers_goal ON goal_milestone_triggers(goal_id, epoch);

-- 6. Goal Action Deliveries Table
CREATE TABLE IF NOT EXISTS goal_action_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  milestone_trigger_id UUID REFERENCES goal_milestone_triggers(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  target_url VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  http_status INTEGER,
  error_message TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_action_deliveries_goal ON goal_action_deliveries(goal_id);

COMMIT;
