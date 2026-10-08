-- Fail closed. Only a reviewed operator action may clear prior security gates.
CREATE TABLE v2_earn_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  phase1_cleared boolean NOT NULL DEFAULT false,
  earn_enabled boolean NOT NULL DEFAULT false,
  clearance_reference text,
  CHECK (NOT earn_enabled OR (phase1_cleared AND length(clearance_reference) >= 10))
);
INSERT INTO v2_earn_gate(singleton) VALUES(true);
-- Provisioned by an operator, never by browser enrollment or public API.
CREATE TABLE v2_offer_partners (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{3,40}$'),
  name text NOT NULL,
  logo_url text,
  secret_env_key text NOT NULL CHECK (secret_env_key ~ '^V2_OFFER_CALLBACK_[A-Z0-9_]+$'),
  integration_actor_id text NOT NULL REFERENCES v2_accounts(id),
  active boolean NOT NULL DEFAULT false
);
CREATE TABLE v2_offers (
  id uuid PRIMARY KEY,
  partner_id text NOT NULL REFERENCES v2_offer_partners(id),
  title text NOT NULL,
  description text NOT NULL,
  terms text NOT NULL,
  points integer NOT NULL CHECK (points BETWEEN 1 AND 1000000),
  destination_url text NOT NULL,
  category text NOT NULL CHECK (category IN ('shopping','subscriptions','surveys','apps','services','finance','travel','food','entertainment','other')),
  requirements text NOT NULL,
  completion_steps text NOT NULL,
  estimated_minutes integer NOT NULL CHECK (estimated_minutes BETWEEN 1 AND 10080),
  approval_days integer NOT NULL CHECK (approval_days BETWEEN 1 AND 365),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  created_by text NOT NULL REFERENCES v2_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE v2_offer_clicks (
  id uuid PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES v2_offers(id),
  account_id text NOT NULL REFERENCES v2_accounts(id),
  request_key uuid NOT NULL UNIQUE,
  points integer NOT NULL CHECK (points BETWEEN 1 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_offer_clicks_owner_idx ON v2_offer_clicks(account_id,created_at DESC);
CREATE TABLE v2_offer_conversions (
  id uuid PRIMARY KEY,
  partner_id text NOT NULL REFERENCES v2_offer_partners(id),
  event_id text NOT NULL,
  click_id uuid NOT NULL UNIQUE REFERENCES v2_offer_clicks(id),
  transaction_id uuid NOT NULL UNIQUE REFERENCES v2_points_transactions(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  partner_status text NOT NULL CHECK (partner_status IN ('pending','verified','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id,event_id)
);
CREATE TABLE v2_offer_callback_receipts (
  partner_id text NOT NULL REFERENCES v2_offer_partners(id),
  nonce uuid NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id,nonce)
);
CREATE TRIGGER v2_clicks_append_only BEFORE UPDATE OR DELETE ON v2_offer_clicks
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER v2_callback_receipts_append_only BEFORE UPDATE OR DELETE ON v2_offer_callback_receipts
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE FUNCTION v2_protect_offer_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status')
    THEN RAISE EXCEPTION 'Offer economics and terms are immutable; create a new reviewed offer'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v2_offer_terms_immutable BEFORE UPDATE ON v2_offers
  FOR EACH ROW EXECUTE FUNCTION v2_protect_offer_terms();
CREATE FUNCTION v2_protect_conversion_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.partner_id,NEW.event_id,NEW.click_id,NEW.transaction_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.partner_id,OLD.event_id,OLD.click_id,OLD.transaction_id,OLD.created_at)
    THEN RAISE EXCEPTION 'Conversion identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v2_conversion_identity_immutable BEFORE UPDATE ON v2_offer_conversions
  FOR EACH ROW EXECUTE FUNCTION v2_protect_conversion_identity();
CREATE TRIGGER v2_offers_no_delete BEFORE DELETE ON v2_offers
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER v2_conversions_no_delete BEFORE DELETE ON v2_offer_conversions
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
