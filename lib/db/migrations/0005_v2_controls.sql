-- Additive. Owner-approved economic and security rules (2026-10-09).
-- Opens no gate, seeds no partner/reward/budget and changes no existing history.

-- Versioned economy and control settings. Latest version applies; history is append-only.
CREATE TABLE v2_economy_config (
  version integer PRIMARY KEY CHECK (version >= 1),
  points_per_nok integer NOT NULL CHECK (points_per_nok = 100),
  default_share_bp integer NOT NULL,
  max_share_bp integer NOT NULL CHECK (max_share_bp BETWEEN 0 AND 4000),
  min_margin_bp integer NOT NULL CHECK (min_margin_bp BETWEEN 5000 AND 10000),
  high_risk_cooldown_minutes integer NOT NULL CHECK (high_risk_cooldown_minutes BETWEEN 60 AND 10080),
  high_value_order_points integer NOT NULL CHECK (high_value_order_points BETWEEN 1 AND 1000000),
  dual_control boolean NOT NULL,
  min_account_age_days integer NOT NULL CHECK (min_account_age_days BETWEEN 0 AND 365),
  min_verified_points_before_redeem integer NOT NULL CHECK (min_verified_points_before_redeem BETWEEN 0 AND 1000000),
  max_redemptions_per_day integer NOT NULL CHECK (max_redemptions_per_day BETWEEN 1 AND 100),
  max_redeem_points_per_day integer NOT NULL CHECK (max_redeem_points_per_day BETWEEN 1 AND 1000000),
  created_by text NOT NULL,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (default_share_bp BETWEEN 0 AND max_share_bp)
);
INSERT INTO v2_economy_config(version,points_per_nok,default_share_bp,max_share_bp,min_margin_bp,
  high_risk_cooldown_minutes,high_value_order_points,dual_control,min_account_age_days,
  min_verified_points_before_redeem,max_redemptions_per_day,max_redeem_points_per_day,created_by)
VALUES(1,100,3000,4000,5000,60,50000,false,7,1000,3,100000,'migration:0005_v2_controls');
CREATE TRIGGER v2_economy_config_append_only BEFORE UPDATE OR DELETE ON v2_economy_config
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();

-- High-risk administrative actions are requested first and executed later by an explicit,
-- MFA-reverified confirmation. Payload and timing are immutable.
CREATE TABLE v2_admin_requests (
  id uuid PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('POINTS_ADJUSTMENT','POINTS_DECISION','POINTS_COMPENSATION',
    'OFFER_APPROVAL','REWARD_APPROVAL','ORDER_DISPATCH','ECONOMY_CONFIG','MARKETING_BUDGET')),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  target_account_id text REFERENCES v2_accounts(id),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  requested_by text NOT NULL REFERENCES v2_accounts(id),
  request_key text NOT NULL UNIQUE CHECK (request_key ~ '^[A-Za-z0-9_.:-]{16,128}$'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  not_before timestamptz NOT NULL,
  CHECK (not_before >= requested_at + interval '60 minutes'),
  CHECK (target_account_id IS NULL OR target_account_id <> requested_by)
);
CREATE INDEX v2_admin_requests_recent_idx ON v2_admin_requests(requested_at DESC);
CREATE TABLE v2_admin_request_events (
  sequence bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES v2_admin_requests(id),
  status text NOT NULL CHECK (status IN ('pending','executed','rejected','cancelled')),
  actor_id text NOT NULL REFERENCES v2_accounts(id),
  note text CHECK (note IS NULL OR length(note) <= 500),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- At most one terminal outcome per request: a request can never execute twice.
CREATE UNIQUE INDEX v2_admin_request_terminal_idx ON v2_admin_request_events(request_id) WHERE status <> 'pending';
CREATE INDEX v2_admin_request_events_idx ON v2_admin_request_events(request_id, sequence DESC);
CREATE TRIGGER v2_admin_requests_append_only BEFORE UPDATE OR DELETE ON v2_admin_requests
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER v2_admin_request_events_append_only BEFORE UPDATE OR DELETE ON v2_admin_request_events
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE INDEX v2_audit_recent_idx ON v2_audit_logs(created_at DESC);
