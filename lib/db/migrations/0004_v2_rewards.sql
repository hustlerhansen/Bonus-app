-- No suppliers, rewards or commercial clearance are seeded.
CREATE TABLE v2_redeem_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  commercial_reference text,
  CHECK(NOT enabled OR COALESCE(length(commercial_reference)>=10,false))
);
INSERT INTO v2_redeem_gate(singleton) VALUES(true);
CREATE TABLE v2_reward_suppliers (
  id text PRIMARY KEY CHECK(id ~ '^[a-z0-9-]{3,40}$'),
  name text NOT NULL,
  agreement_reference text NOT NULL CHECK(length(agreement_reference)>=10),
  integration_actor_id text NOT NULL REFERENCES v2_accounts(id),
  active boolean NOT NULL DEFAULT false
);
CREATE TABLE v2_reward_risk_blocks (
  account_id text PRIMARY KEY REFERENCES v2_accounts(id),
  reason_reference text NOT NULL CHECK(length(reason_reference)>=10)
);
CREATE TABLE v2_rewards (
  id uuid PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES v2_reward_suppliers(id),
  supplier_sku text NOT NULL CHECK(length(supplier_sku)>0),
  approval_reference text NOT NULL CHECK(length(approval_reference)>=10),
  title text NOT NULL,
  description text NOT NULL,
  terms text NOT NULL,
  points integer NOT NULL CHECK(points BETWEEN 1 AND 1000000),
  stock_total integer NOT NULL CHECK(stock_total BETWEEN 0 AND 1000000),
  stock_available integer NOT NULL CHECK(stock_available BETWEEN 0 AND stock_total),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','disabled')),
  created_by text NOT NULL REFERENCES v2_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE v2_reward_orders (
  id uuid PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  reward_id uuid NOT NULL REFERENCES v2_rewards(id),
  account_id text NOT NULL REFERENCES v2_accounts(id),
  points integer NOT NULL CHECK(points BETWEEN 1 AND 1000000),
  transaction_id uuid NOT NULL UNIQUE REFERENCES v2_points_transactions(id),
  refund_transaction_id uuid UNIQUE REFERENCES v2_points_transactions(id),
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','delivering','uncertain','delivered','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_reward_orders_owner_idx ON v2_reward_orders(account_id,sequence DESC);
CREATE INDEX v2_reward_orders_queue_idx ON v2_reward_orders(status,sequence);
CREATE TABLE v2_reward_requests (
  request_key uuid PRIMARY KEY,
  fingerprint text NOT NULL,
  order_id uuid NOT NULL REFERENCES v2_reward_orders(id)
);
CREATE TRIGGER v2_reward_requests_immutable BEFORE UPDATE OR DELETE ON v2_reward_requests
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER v2_rewards_no_delete BEFORE DELETE ON v2_rewards
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER v2_reward_orders_no_delete BEFORE DELETE ON v2_reward_orders
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE FUNCTION v2_reward_immutable_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'status'-'stock_available') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'stock_available')
    THEN RAISE EXCEPTION 'Reward terms and total inventory are immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER v2_reward_terms_immutable BEFORE UPDATE ON v2_rewards
  FOR EACH ROW EXECUTE FUNCTION v2_reward_immutable_terms();
CREATE FUNCTION v2_reward_order_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'status'-'updated_at'-'refund_transaction_id') IS DISTINCT FROM
     (to_jsonb(OLD)-'status'-'updated_at'-'refund_transaction_id')
    THEN RAISE EXCEPTION 'Order identity and price are immutable'; END IF;
  IF OLD.refund_transaction_id IS NOT NULL AND NEW.refund_transaction_id IS DISTINCT FROM OLD.refund_transaction_id
    THEN RAISE EXCEPTION 'Refund identity is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER v2_reward_order_identity_immutable BEFORE UPDATE ON v2_reward_orders
  FOR EACH ROW EXECUTE FUNCTION v2_reward_order_identity();
