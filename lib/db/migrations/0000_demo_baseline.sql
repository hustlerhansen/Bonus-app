-- Baseline for the legacy demo tables, previously created by `drizzle-kit push`.
-- Idempotent: existing demo databases are unchanged. All schema changes now use these migrations.
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"xp" integer DEFAULT 1250 NOT NULL,
	"level" integer DEFAULT 7 NOT NULL,
	"streak" integer DEFAULT 6 NOT NULL,
	"last_daily_claim" date,
	"total_points_earned" integer DEFAULT 34550 NOT NULL,
	"games_played" integer DEFAULT 27 NOT NULL,
	"surveys_completed" integer DEFAULT 8 NOT NULL,
	"active_referrals" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'points' NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"xp" integer NOT NULL,
	"gems" integer DEFAULT 5 NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "rewards" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"cost" integer NOT NULL,
	"nok_amount" integer NOT NULL,
	"category" text NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "activity_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"points" integer NOT NULL,
	"xp" integer NOT NULL,
	"gems" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"event" text NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reward_id" text NOT NULL,
	"reward_title" text NOT NULL,
	"nok_amount" integer NOT NULL,
	"points" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "fraud_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "revenue_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_id" text NOT NULL,
	"provider_event_id" text,
	"gross_revenue_ore" integer NOT NULL,
	"provider_cost_ore" integer NOT NULL,
	"reward_cost_ore" integer NOT NULL,
	"contribution_ore" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_events_provider_event_id_unique" UNIQUE("provider_event_id")
);

CREATE TABLE IF NOT EXISTS "events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"target" integer DEFAULT 500 NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "notification_reads" (
	"user_id" text NOT NULL,
	"notification_id" text NOT NULL,
	CONSTRAINT "notification_reads_user_id_notification_id_pk" PRIMARY KEY("user_id","notification_id")
);

CREATE TABLE IF NOT EXISTS "user_achievements" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_user_id_users_id_fk') THEN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_claims_user_id_users_id_fk') THEN
  ALTER TABLE "activity_claims" ADD CONSTRAINT "activity_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_events_user_id_users_id_fk') THEN
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'redemptions_user_id_users_id_fk') THEN
  ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'redemptions_reward_id_rewards_id_fk') THEN
  ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE no action ON UPDATE no action;
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_reads_user_id_users_id_fk') THEN
  ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_achievements_user_id_users_id_fk') THEN
  ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_idempotency_currency_idx" ON "wallet_transactions" USING btree ("user_id","idempotency_key","currency");
CREATE INDEX IF NOT EXISTS "wallet_user_created_idx" ON "wallet_transactions" USING btree ("user_id","created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "claim_idempotency_idx" ON "activity_claims" USING btree ("user_id","idempotency_key");
CREATE INDEX IF NOT EXISTS "claim_user_activity_idx" ON "activity_claims" USING btree ("user_id","activity_id","created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "redemption_idempotency_idx" ON "redemptions" USING btree ("user_id","idempotency_key");
