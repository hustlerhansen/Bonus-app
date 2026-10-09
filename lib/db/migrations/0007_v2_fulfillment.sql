-- Additive. Gift cards are delivered manually in the MVP: the administrator records the code
-- or link from the supplier portal; it is stored encrypted (AES-256-GCM, application key) and
-- shown only to the order owner. Automatic supplier APIs are a later, separately approved step.
ALTER TABLE v2_reward_suppliers ADD COLUMN fulfillment_mode text NOT NULL DEFAULT 'manual'
  CONSTRAINT v2_reward_suppliers_manual_only CHECK (fulfillment_mode = 'manual');

CREATE TABLE v2_reward_deliveries (
  order_id uuid PRIMARY KEY REFERENCES v2_reward_orders(id),
  kind text NOT NULL CHECK (kind IN ('code','link')),
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) BETWEEN 1 AND 4096),
  iv bytea NOT NULL CHECK (octet_length(iv) = 12),
  tag bytea NOT NULL CHECK (octet_length(tag) = 16),
  key_version integer NOT NULL CHECK (key_version >= 1),
  entered_by text NOT NULL REFERENCES v2_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER v2_reward_deliveries_append_only BEFORE UPDATE OR DELETE ON v2_reward_deliveries
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
-- A delivered order must carry its encrypted voucher (checked at commit).
CREATE FUNCTION v2_delivered_requires_voucher() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'delivered' AND NOT EXISTS (SELECT 1 FROM v2_reward_deliveries WHERE order_id = NEW.id) THEN
    RAISE EXCEPTION 'A delivered gift card order requires a recorded voucher' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER v2_reward_order_voucher AFTER UPDATE ON v2_reward_orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status = 'delivered' AND OLD.status <> 'delivered')
  EXECUTE FUNCTION v2_delivered_requires_voucher();
CREATE INDEX v2_reward_orders_daily_idx ON v2_reward_orders(account_id, created_at DESC);
