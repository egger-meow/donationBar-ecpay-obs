BEGIN;

ALTER TABLE payment_history DROP CONSTRAINT IF EXISTS payment_history_ecpay_merchant_trade_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_history_ecpay_trade_no
  ON payment_history (ecpay_trade_no)
  WHERE ecpay_trade_no IS NOT NULL;

COMMIT;
