-- An administrative reversal is distinct from signed terminal partner evidence.
ALTER TABLE v2_offer_conversions DROP CONSTRAINT v2_offer_conversions_status_check;
ALTER TABLE v2_offer_conversions ADD CONSTRAINT v2_offer_conversions_status_check
  CHECK (status IN ('pending','verified','rejected','reversed'));

CREATE TABLE v2_offer_reversal_events (
  conversion_id uuid PRIMARY KEY REFERENCES v2_offer_conversions(id),
  status text NOT NULL DEFAULT 'reversed' CHECK (status='reversed'),
  compensation_transaction_id uuid NOT NULL UNIQUE REFERENCES v2_points_transactions(id),
  actor_id text NOT NULL REFERENCES v2_accounts(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER v2_offer_reversal_events_append_only BEFORE UPDATE OR DELETE ON v2_offer_reversal_events
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();

CREATE OR REPLACE FUNCTION v2_protect_conversion_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.partner_id,NEW.event_id,NEW.click_id,NEW.transaction_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.partner_id,OLD.event_id,OLD.click_id,OLD.transaction_id,OLD.created_at)
    THEN RAISE EXCEPTION 'Conversion identity is immutable'; END IF;
  IF OLD.partner_status <> 'pending' AND NEW.partner_status <> OLD.partner_status
    THEN RAISE EXCEPTION 'Terminal partner evidence is immutable'; END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status='pending' AND NEW.status IN ('verified','rejected')) OR
    (OLD.status='verified' AND NEW.status='reversed' AND NEW.partner_status='verified')
  ) THEN RAISE EXCEPTION 'Invalid conversion lifecycle transition'; END IF;
  RETURN NEW;
END;
$$;

-- Check both sides at commit, allowing the service to compose the writes atomically.
CREATE FUNCTION v2_check_offer_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cid uuid;
  v v2_offer_conversions;
  e v2_offer_reversal_events;
BEGIN
  IF TG_TABLE_NAME='v2_offer_conversions' THEN cid := NEW.id;
  ELSE cid := NEW.conversion_id; END IF;
  SELECT * INTO v FROM v2_offer_conversions WHERE id=cid;
  SELECT * INTO e FROM v2_offer_reversal_events WHERE conversion_id=cid;
  IF (v.status='reversed') IS DISTINCT FROM (e.conversion_id IS NOT NULL)
    THEN RAISE EXCEPTION 'Reversed conversion requires its lifecycle event'; END IF;
  IF e.conversion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM v2_points_transactions t
    JOIN v2_points_transactions original ON original.id=v.transaction_id
    JOIN v2_offer_clicks c ON c.id=v.click_id
    WHERE t.id=e.compensation_transaction_id AND t.related_transaction_id=original.id
      AND t.type='REVERSAL' AND t.amount=-original.amount AND original.amount=c.points
      AND t.account_id=c.account_id AND original.account_id=c.account_id
      AND t.actor_id=e.actor_id AND t.reason=e.reason
      AND original.source='offer:' || v.partner_id AND original.reference=v.event_id
      AND (SELECT status FROM v2_points_events WHERE transaction_id=original.id ORDER BY sequence DESC LIMIT 1)='reversed'
      AND (SELECT status FROM v2_points_events WHERE transaction_id=t.id ORDER BY sequence DESC LIMIT 1)='approved'
  ) THEN RAISE EXCEPTION 'Offer reversal must match its full ledger compensation'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER v2_conversion_reversal_consistent AFTER INSERT OR UPDATE ON v2_offer_conversions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v2_check_offer_reversal();
CREATE CONSTRAINT TRIGGER v2_reversal_event_consistent AFTER INSERT ON v2_offer_reversal_events
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v2_check_offer_reversal();
