import { pgTable, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const activityClaimsTable = pgTable("activity_claims", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  activityId: text("activity_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  points: integer("points").notNull(),
  xp: integer("xp").notNull(),
  gems: integer("gems").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("claim_idempotency_idx").on(table.userId, table.idempotencyKey),
  index("claim_user_activity_idx").on(table.userId, table.activityId, table.createdAt),
]);
export const analyticsEventsTable = pgTable("analytics_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id),
  event: text("event").notNull(),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertActivityClaimSchema = createInsertSchema(activityClaimsTable);
export const insertAnalyticsEventSchema = createInsertSchema(analyticsEventsTable);
