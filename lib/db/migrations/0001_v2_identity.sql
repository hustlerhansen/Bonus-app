CREATE TABLE v2_accounts (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  country text NOT NULL DEFAULT 'NO',
  language text NOT NULL DEFAULT 'nb',
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','PARTNER','ADMIN','SUPER_ADMIN')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETION_REQUESTED')),
  referral_code text NOT NULL UNIQUE,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  privacy_accepted_at timestamptz NOT NULL,
  email_verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  last_session_id text NOT NULL
);
CREATE TABLE v2_consents (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES v2_accounts(id),
  kind text NOT NULL CHECK (kind IN ('TERMS','PRIVACY')),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_consents_account_idx ON v2_consents(account_id, accepted_at);
CREATE TABLE v2_audit_logs (
  id text PRIMARY KEY,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_audit_entity_idx ON v2_audit_logs(entity_type, entity_id, created_at);
CREATE FUNCTION v2_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'V2 history is append-only';
END;
$$;
CREATE TRIGGER v2_audit_append_only BEFORE UPDATE OR DELETE ON v2_audit_logs
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER v2_consents_append_only BEFORE UPDATE OR DELETE ON v2_consents
  FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
