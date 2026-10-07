import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

// Separate identities: a demo account can never become a production account.
export const v2AccountsTable = pgTable("v2_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  country: text("country").notNull().default("NO"),
  language: text("language").notNull().default("nb"),
  role: text("role").notNull().default("USER"),
  status: text("status").notNull().default("ACTIVE"),
  referralCode: text("referral_code").notNull().unique(),
  termsVersion: text("terms_version").notNull(),
  privacyVersion: text("privacy_version").notNull(),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
  privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true }).notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull().defaultNow(),
  lastSessionId: text("last_session_id").notNull(),
});

export const v2ConsentsTable = pgTable("v2_consents", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => v2AccountsTable.id),
  kind: text("kind").notNull(),
  version: text("version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("v2_consents_account_idx").on(t.accountId, t.acceptedAt)]);

export const v2AuditTable = pgTable("v2_audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
