-- Additive. Every point with monetary value must be funded by verified partner revenue or a
-- pre-approved marketing budget. Campaign profitability is computed and stored before activation.
-- XP is a separate, non-monetary ledger. Existing development rows are left unchanged (NOT VALID).

-- Marketing budgets: created only through an executed high-risk request; immutable.
CREATE TABLE v2_marketing_budgets (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 3 AND 120),
  purpose text NOT NULL CHECK (length(trim(purpose)) BETWEEN 10 AND 500),
  points_total integer NOT NULL CHECK (points_total BETWEEN 1 AND 10000000),
  valid_until timestamptz NOT NULL,
  approved_by text NOT NULL REFERENCES v2_accounts(id),
  request_id uuid NOT NULL UNIQUE REFERENCES v2_admin_requests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > created_at)
);
CREATE TRIGGER v2_marketing_budgets_append_only BEFORE UPDATE OR DELETE ON v2_marketing_budgets
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();

-- Funding on ledger credits.
ALTER TABLE v2_points_transactions
  ADD COLUMN funding_kind text CHECK (funding_kind IN ('conversion','budget')),
  ADD COLUMN funding_reference text CHECK (funding_reference IS NULL OR length(funding_reference) BETWEEN 1 AND 128);
ALTER TABLE v2_points_transactions ADD CONSTRAINT v2_points_funding_pair
  CHECK ((funding_kind IS NULL) = (funding_reference IS NULL)) NOT VALID;
ALTER TABLE v2_points_transactions ADD CONSTRAINT v2_points_credit_funded
  CHECK (NOT (type IN ('EARN','REFERRAL','BONUS') OR (type = 'ADJUSTMENT' AND amount > 0)) OR funding_kind IS NOT NULL) NOT VALID;
ALTER TABLE v2_points_transactions ADD CONSTRAINT v2_points_adjustment_budget
  CHECK (type <> 'ADJUSTMENT' OR amount < 0 OR funding_kind = 'budget') NOT VALID;
ALTER TABLE v2_points_transactions ADD CONSTRAINT v2_points_debit_unfunded
  CHECK (amount > 0 OR funding_kind IS NULL) NOT VALID;
CREATE INDEX v2_points_funding_idx ON v2_points_transactions(funding_kind, funding_reference) WHERE funding_kind IS NOT NULL;

-- Budget credits can never exceed the approved budget or be booked after it expires.
CREATE FUNCTION v2_check_budget_funding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b v2_marketing_budgets%ROWTYPE; used bigint;
BEGIN
  IF NEW.funding_kind IS DISTINCT FROM 'budget' THEN RETURN NEW; END IF;
  SELECT * INTO b FROM v2_marketing_budgets WHERE id::text = NEW.funding_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown marketing budget' USING ERRCODE = '23503'; END IF;
  IF b.valid_until <= now() THEN RAISE EXCEPTION 'Marketing budget expired' USING ERRCODE = '23514'; END IF;
  SELECT COALESCE(sum(t.amount),0) INTO used FROM v2_points_transactions t
    WHERE t.funding_kind = 'budget' AND t.funding_reference = NEW.funding_reference
      AND NOT EXISTS (SELECT 1 FROM v2_points_events e WHERE e.transaction_id = t.id AND e.status = 'rejected');
  IF used + NEW.amount > b.points_total THEN RAISE EXCEPTION 'Marketing budget exhausted' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER v2_points_budget_funding BEFORE INSERT ON v2_points_transactions
  FOR EACH ROW EXECUTE FUNCTION v2_check_budget_funding();

-- Campaign economics: one immutable profitability snapshot per offer, computed from the
-- active economy version. The database recomputes the arithmetic.
CREATE TABLE v2_offer_economics (
  offer_id uuid PRIMARY KEY REFERENCES v2_offers(id),
  config_version integer NOT NULL REFERENCES v2_economy_config(version),
  gross_cpa_ore integer NOT NULL CHECK (gross_cpa_ore BETWEEN 100 AND 100000000),
  network_fee_bp integer NOT NULL CHECK (network_fee_bp BETWEEN 0 AND 9000),
  expected_reversal_bp integer NOT NULL CHECK (expected_reversal_bp BETWEEN 0 AND 9000),
  giftcard_fee_bp integer NOT NULL CHECK (giftcard_fee_bp BETWEEN 0 AND 2000),
  user_share_bp integer NOT NULL CHECK (user_share_bp BETWEEN 1 AND 4000),
  net_ore integer NOT NULL CHECK (net_ore > 0),
  points integer NOT NULL CHECK (points BETWEEN 1 AND 1000000),
  expected_margin_bp integer NOT NULL CHECK (expected_margin_bp BETWEEN 5000 AND 10000),
  max_conversions integer NOT NULL CHECK (max_conversions BETWEEN 1 AND 1000000),
  payment_terms_days integer NOT NULL CHECK (payment_terms_days BETWEEN 0 AND 365),
  agreement_reference text NOT NULL CHECK (length(trim(agreement_reference)) BETWEEN 10 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (net_ore = gross_cpa_ore::bigint * (10000 - network_fee_bp) / 10000),
  CHECK (points = net_ore::bigint * user_share_bp / 10000),
  CHECK (expected_margin_bp = ((net_ore::bigint * (10000 - expected_reversal_bp) / 10000)
    - (points::bigint * (10000 + giftcard_fee_bp) / 10000)) * 10000 / net_ore)
);
CREATE TRIGGER v2_offer_economics_append_only BEFORE UPDATE OR DELETE ON v2_offer_economics
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE FUNCTION v2_offer_economics_match() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM v2_offers WHERE id = NEW.offer_id AND points = NEW.points AND status = 'draft') THEN
    RAISE EXCEPTION 'Offer points must equal the computed campaign economics' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER v2_offer_economics_points BEFORE INSERT ON v2_offer_economics
  FOR EACH ROW EXECUTE FUNCTION v2_offer_economics_match();
-- New activations require a profitability snapshot.
CREATE FUNCTION v2_offer_requires_economics() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved'
    AND NOT EXISTS (SELECT 1 FROM v2_offer_economics WHERE offer_id = NEW.id) THEN
    RAISE EXCEPTION 'Campaign economics are required before activation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER v2_offer_activation_economics BEFORE UPDATE ON v2_offers
  FOR EACH ROW EXECUTE FUNCTION v2_offer_requires_economics();

-- Conversion-funded credits must point at the conversion that books them (checked at commit).
CREATE FUNCTION v2_check_conversion_funding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.funding_kind = 'conversion' AND NOT EXISTS (
    SELECT 1 FROM v2_offer_conversions v JOIN v2_offer_clicks c ON c.id = v.click_id
    JOIN v2_offer_economics x ON x.offer_id = c.offer_id
    WHERE v.id::text = NEW.funding_reference AND v.transaction_id = NEW.id) THEN
    RAISE EXCEPTION 'Conversion funding must reference the conversion of a costed campaign' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER v2_points_conversion_funding AFTER INSERT ON v2_points_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v2_check_conversion_funding();

-- Reward pricing: points equal the face value in øre (100 BP = 1 kr); cost is recorded.
ALTER TABLE v2_rewards ADD COLUMN face_value_ore integer CHECK (face_value_ore IS NULL OR face_value_ore BETWEEN 100 AND 1000000),
  ADD COLUMN cost_ore integer CHECK (cost_ore IS NULL OR cost_ore BETWEEN 0 AND 2000000);
ALTER TABLE v2_rewards ADD CONSTRAINT v2_rewards_priced_at_face_value
  CHECK (face_value_ore IS NOT NULL AND cost_ore IS NOT NULL AND points = face_value_ore) NOT VALID;

-- Non-monetary engagement: XP never touches the points ledger.
CREATE TABLE v2_xp_events (
  id bigserial PRIMARY KEY,
  account_id text NOT NULL REFERENCES v2_accounts(id),
  kind text NOT NULL CHECK (kind IN ('DAILY_CHECKIN','STREAK_BONUS','OFFER_VERIFIED','PROFILE_COMPLETED')),
  xp integer NOT NULL CHECK (xp BETWEEN 1 AND 10000),
  reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 128),
  oslo_day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, kind, reference)
);
CREATE INDEX v2_xp_account_idx ON v2_xp_events(account_id, oslo_day DESC);
CREATE TRIGGER v2_xp_events_append_only BEFORE UPDATE OR DELETE ON v2_xp_events
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
