import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const featureFlagsTable = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
});
export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const fraudEventsTable = pgTable("fraud_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  reason: text("reason").notNull(),
  riskScore: integer("risk_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const revenueEventsTable = pgTable("revenue_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceId: text("source_id").notNull(),
  providerEventId: text("provider_event_id").unique(),
  grossRevenueOre: integer("gross_revenue_ore").notNull(),
  providerCostOre: integer("provider_cost_ore").notNull(),
  rewardCostOre: integer("reward_cost_ore").notNull(),
  contributionOre: integer("contribution_ore").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertFeatureFlagSchema = createInsertSchema(featureFlagsTable);
export const insertAuditLogSchema = createInsertSchema(auditLogsTable);
export const insertFraudEventSchema = createInsertSchema(fraudEventsTable);
export const insertRevenueEventSchema = createInsertSchema(revenueEventsTable);
