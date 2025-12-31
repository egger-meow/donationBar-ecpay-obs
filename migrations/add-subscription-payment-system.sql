-- Migration: Add subscription payment system support
-- Week 1: Payment History and ECPay Integration
-- Run this migration before implementing subscription endpoints

-- =============================================
-- STEP 1: Add ECPay tracking fields to subscriptions table
-- =============================================
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ecpay_merchant_trade_no VARCHAR(255);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ecpay_trade_no VARCHAR(255);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_payment_status VARCHAR(20);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS failed_payment_count INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_end_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_ecpay_merchant_trade_no ON subscriptions(ecpay_merchant_trade_no);
CREATE INDEX IF NOT EXISTS idx_subscriptions_last_payment_status ON subscriptions(last_payment_status);

-- =============================================
-- STEP 2: Create payment_history table
-- =============================================
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Payment amount
  amount INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'TWD',
  
  -- Payment status
  status VARCHAR(20) NOT NULL, -- success, failed, pending, refunded
  
  -- ECPay transaction details
  ecpay_trade_no VARCHAR(255),
  ecpay_merchant_trade_no VARCHAR(255),
  ecpay_payment_date TIMESTAMP WITH TIME ZONE,
  
  -- Payment method info
  payment_method VARCHAR(50),
  payment_method_last4 VARCHAR(4),
  payment_method_type VARCHAR(20), -- Credit, UnionPay, etc.
  
  -- Card details (from ECPay CardInfo)
  card_auth_code VARCHAR(6),
  card_first6 VARCHAR(6),
  card_last4 VARCHAR(4),
  issuing_bank VARCHAR(100),
  issuing_bank_code VARCHAR(20),
  
  -- Invoice information
  invoice_number VARCHAR(50),
  invoice_url TEXT,
  
  -- Error handling
  error_message TEXT,
  error_code VARCHAR(20),
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  period_type VARCHAR(1), -- D, M, Y
  frequency INTEGER,
  exec_times INTEGER,
  total_success_times INTEGER,
  total_success_amount INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique ECPay trade numbers
  UNIQUE(ecpay_merchant_trade_no)
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_payment_history_subscription ON payment_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_user ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_ecpay_trade ON payment_history(ecpay_trade_no);
CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_history_next_retry ON payment_history(next_retry_at) WHERE status = 'failed';

-- =============================================
-- STEP 3: Add billing_cycle_start and next_billing_date if missing
-- =============================================
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP WITH TIME ZONE;

-- =============================================
-- STEP 4: Update function for automatic timestamp updates
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for payment_history
DROP TRIGGER IF EXISTS update_payment_history_updated_at ON payment_history;
CREATE TRIGGER update_payment_history_updated_at
    BEFORE UPDATE ON payment_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- STEP 5: Create view for easy subscription overview
-- =============================================
CREATE OR REPLACE VIEW subscription_overview AS
SELECT 
    s.id AS subscription_id,
    s.user_id,
    u.email,
    u.username,
    s.plan_type,
    s.status,
    s.price_per_month,
    s.currency,
    s.is_trial,
    s.trial_end_date,
    s.billing_cycle_start,
    s.next_billing_date,
    s.ecpay_merchant_trade_no,
    s.last_payment_date,
    s.last_payment_status,
    s.failed_payment_count,
    s.paused_at,
    s.grace_period_end_at,
    s.created_at,
    -- Payment statistics
    COUNT(ph.id) FILTER (WHERE ph.status = 'success') AS total_successful_payments,
    COUNT(ph.id) FILTER (WHERE ph.status = 'failed') AS total_failed_payments,
    SUM(ph.amount) FILTER (WHERE ph.status = 'success') AS total_paid_amount,
    MAX(ph.paid_at) FILTER (WHERE ph.status = 'success') AS last_successful_payment_at
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
LEFT JOIN payment_history ph ON s.id = ph.subscription_id
GROUP BY s.id, u.email, u.username;

COMMENT ON VIEW subscription_overview IS 'Comprehensive view of subscription status with payment statistics';

-- =============================================
-- Migration complete
-- =============================================
COMMENT ON TABLE payment_history IS 'Stores all subscription payment transactions from ECPay periodic payments';
COMMENT ON COLUMN subscriptions.ecpay_merchant_trade_no IS 'ECPay订单编号 for the initial subscription authorization';
COMMENT ON COLUMN subscriptions.last_payment_status IS 'Status of most recent payment attempt: success, failed, pending';
COMMENT ON COLUMN subscriptions.failed_payment_count IS 'Number of consecutive failed payment attempts';
COMMENT ON COLUMN subscriptions.grace_period_end_at IS 'Allow access until this date even after payment failure';
