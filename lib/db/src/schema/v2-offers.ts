import { pgTable, text, timestamp, integer, uuid, boolean, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { v2AccountsTable } from "./v2-accounts";
import { v2PointsTransactionsTable } from "./v2-points";

// SQL migrations remain authoritative for checks and history-protection triggers.
export const v2EarnGateTable = pgTable("v2_earn_gate", {
  singleton: boolean("singleton").primaryKey().default(true),
  phase1Cleared: boolean("phase1_cleared").notNull().default(false),
  earnEnabled: boolean("earn_enabled").notNull().default(false),
  clearanceReference: text("clearance_reference"),
});
export const v2OfferPartnersTable = pgTable("v2_offer_partners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  secretEnvKey: text("secret_env_key").notNull(),
  integrationActorId: text("integration_actor_id").notNull().references(() => v2AccountsTable.id),
  active: boolean("active").notNull().default(false),
});
export const v2OffersTable = pgTable("v2_offers", {
  id: uuid("id").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => v2OfferPartnersTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  terms: text("terms").notNull(),
  points: integer("points").notNull(),
  destinationUrl: text("destination_url").notNull(),
  category: text("category").notNull(),
  requirements: text("requirements").notNull(),
  completionSteps: text("completion_steps").notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  approvalDays: integer("approval_days").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").notNull().references(() => v2AccountsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const v2OfferClicksTable = pgTable("v2_offer_clicks", {
  id: uuid("id").primaryKey(),
  offerId: uuid("offer_id").notNull().references(() => v2OffersTable.id),
  accountId: text("account_id").notNull().references(() => v2AccountsTable.id),
  requestKey: uuid("request_key").notNull().unique(),
  points: integer("points").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("v2_offer_clicks_owner_idx").on(t.accountId, t.createdAt)]);
export const v2OfferConversionsTable = pgTable("v2_offer_conversions", {
  id: uuid("id").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => v2OfferPartnersTable.id),
  eventId: text("event_id").notNull(),
  clickId: uuid("click_id").notNull().unique().references(() => v2OfferClicksTable.id),
  transactionId: uuid("transaction_id").notNull().unique().references(() => v2PointsTransactionsTable.id),
  status: text("status").notNull().default("pending"),
  partnerStatus: text("partner_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("v2_offer_conversion_partner_event_idx").on(t.partnerId, t.eventId)]);
export const v2OfferCallbackReceiptsTable = pgTable("v2_offer_callback_receipts", {
  partnerId: text("partner_id").notNull().references(() => v2OfferPartnersTable.id),
  nonce: uuid("nonce").notNull(),
  payloadHash: text("payload_hash").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.partnerId, t.nonce] })]);
