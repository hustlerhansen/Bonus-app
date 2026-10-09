-- The legacy demo is private: only enrolled V2 accounts on this list may open a demo session.
-- Demo data stays in the demo tables and has no path to V2 points or rewards.
CREATE TABLE v2_demo_testers (
  account_id text PRIMARY KEY REFERENCES v2_accounts(id),
  can_admin boolean NOT NULL DEFAULT false,
  added_by text NOT NULL REFERENCES v2_accounts(id),
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 3 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
