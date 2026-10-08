import { pgTable, text, boolean, uuid, integer, bigint, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { v2AccountsTable } from "./v2-accounts";
import { v2PointsTransactionsTable } from "./v2-points";

// SQL migrations own CHECK constraints and immutable history triggers.
export const v2RedeemGateTable = pgTable("v2_redeem_gate", {
  singleton: boolean("singleton").primaryKey().default(true),
  enabled: boolean("enabled").notNull().default(false),
  commercialReference: text("commercial_reference"),
});
export const v2RewardSuppliersTable = pgTable("v2_reward_suppliers", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  agreementReference: text("agreement_reference").notNull(),
  integrationActorId: text("integration_actor_id").notNull().references(() => v2AccountsTable.id),
  active: boolean("active").notNull().default(false),
});
export const v2RewardRiskBlocksTable = pgTable("v2_reward_risk_blocks", {
  accountId: text("account_id").primaryKey().references(() => v2AccountsTable.id),
  reasonReference: text("reason_reference").notNull(),
});
export const v2RewardsTable = pgTable("v2_rewards", {
  id: uuid("id").primaryKey(),
  supplierId: text("supplier_id").notNull().references(() => v2RewardSuppliersTable.id),
  supplierSku: text("supplier_sku").notNull(), approvalReference: text("approval_reference").notNull(),
  title: text("title").notNull(), description: text("description").notNull(), terms: text("terms").notNull(),
  points: integer("points").notNull(), stockTotal: integer("stock_total").notNull(),
  stockAvailable: integer("stock_available").notNull(), status: text("status").notNull().default("draft"),
  createdBy: text("created_by").notNull().references(() => v2AccountsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const v2RewardOrdersTable = pgTable("v2_reward_orders", {
  id: uuid("id").primaryKey(), sequence: bigint("sequence", { mode: "bigint" }).generatedAlwaysAsIdentity().unique(),
  rewardId: uuid("reward_id").notNull().references(() => v2RewardsTable.id),
  accountId: text("account_id").notNull().references(() => v2AccountsTable.id),
  points: integer("points").notNull(),
  transactionId: uuid("transaction_id").notNull().unique().references(() => v2PointsTransactionsTable.id),
  refundTransactionId: uuid("refund_transaction_id").unique().references(() => v2PointsTransactionsTable.id),
  status: text("status").notNull().default("reserved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("v2_reward_orders_owner_idx").on(t.accountId, t.sequence), index("v2_reward_orders_queue_idx").on(t.status, t.sequence)]);
export const v2RewardRequestsTable = pgTable("v2_reward_requests", {
  requestKey: uuid("request_key").primaryKey(), fingerprint: text("fingerprint").notNull(),
  orderId: uuid("order_id").notNull().references(() => v2RewardOrdersTable.id),
});
export const insertV2RewardSchema = createInsertSchema(v2RewardsTable);
export type V2RewardRecord = typeof v2RewardsTable.$inferSelect;
export const insertV2RewardOrderSchema = createInsertSchema(v2RewardOrdersTable);
export type V2RewardOrderRecord = typeof v2RewardOrdersTable.$inferSelect;
