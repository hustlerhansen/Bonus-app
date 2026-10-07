-- Additive only. No demo balance import and no mutable balance column.
CREATE TABLE v2_points_transactions (
  id uuid PRIMARY KEY,
  sequence bigserial NOT NULL UNIQUE,
  account_id text NOT NULL REFERENCES v2_accounts(id),
  type text NOT NULL CHECK (type IN ('EARN','REDEEM','REFERRAL','BONUS','ADJUSTMENT','REFUND','REVERSAL','EXPIRATION')),
  amount integer NOT NULL CHECK (amount <> 0 AND amount BETWEEN -1000000 AND 1000000),
  source text NOT NULL,
  reference text NOT NULL,
  description text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  related_transaction_id uuid REFERENCES v2_points_transactions(id),
  actor_id text NOT NULL REFERENCES v2_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, reference),
  UNIQUE (related_transaction_id),
  CHECK ((type IN ('EARN','REFERRAL','BONUS','REFUND') AND amount > 0)
    OR (type IN ('REDEEM','EXPIRATION') AND amount < 0)
    OR type IN ('ADJUSTMENT','REVERSAL')),
  CHECK ((type IN ('REFUND','REVERSAL')) = (related_transaction_id IS NOT NULL))
);
CREATE INDEX v2_points_account_page_idx ON v2_points_transactions(account_id, sequence DESC);
CREATE TABLE v2_points_events (
  sequence bigserial PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES v2_points_transactions(id),
  status text NOT NULL CHECK (status IN ('pending','approved','rejected','reversed')),
  delta integer NOT NULL,
  reserved_delta integer NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  actor_id text NOT NULL REFERENCES v2_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_points_event_latest_idx ON v2_points_events(transaction_id, sequence DESC);
CREATE TABLE v2_points_requests (
  idempotency_key text PRIMARY KEY CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  fingerprint text NOT NULL,
  transaction_id uuid NOT NULL REFERENCES v2_points_transactions(id),
  actor_id text NOT NULL REFERENCES v2_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER v2_points_transactions_append_only BEFORE UPDATE OR DELETE ON v2_points_transactions
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER v2_points_events_append_only BEFORE UPDATE OR DELETE ON v2_points_events
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER v2_points_requests_append_only BEFORE UPDATE OR DELETE ON v2_points_requests
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
