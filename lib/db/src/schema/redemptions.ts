import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";
import { rewardsTable } from "./catalog";

export const redemptionsTable = pgTable("redemptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  rewardId: text("reward_id").notNull().references(() => rewardsTable.id),
  rewardTitle: text("reward_title").notNull(),
  nokAmount: integer("nok_amount").notNull(),
  points: integer("points").notNull(),
  status: text("status").notNull().default("PENDING"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("redemption_idempotency_idx").on(table.userId, table.idempotencyKey)]);
export const insertRedemptionSchema = createInsertSchema(redemptionsTable);
