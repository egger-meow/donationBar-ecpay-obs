-- Migration: Add feedback table
-- Date: 2025-11-10
-- Description: Adds feedback table to store user feedback with full content

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  type VARCHAR(50) DEFAULT 'general',
  message TEXT NOT NULL,
  email VARCHAR(255),
  
  status VARCHAR(20) DEFAULT 'new',
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  CHECK (status IN ('new', 'reviewing', 'resolved', 'closed'))
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- Add comment
COMMENT ON TABLE feedback IS 'User feedback and bug reports with full message content';

-- Migration success message
DO $$
BEGIN
  RAISE NOTICE 'Feedback table created successfully';
END $$;
