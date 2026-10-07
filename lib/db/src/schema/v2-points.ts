import { pgTable, text, timestamp, integer, uuid, bigserial, index, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { v2AccountsTable } from "./v2-accounts";

export const v2PointsTransactionsTable = pgTable("v2_points_transactions", {
  id: uuid("id").primaryKey(),
  sequence: bigserial("sequence", { mode: "bigint" }).notNull().unique(),
  accountId: text("account_id").notNull().references(() => v2AccountsTable.id),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  source: text("source").notNull(),
  reference: text("reference").notNull(),
  description: text("description").notNull(),
  reason: text("reason").notNull(),
  relatedTransactionId: uuid("related_transaction_id").unique().references((): AnyPgColumn => v2PointsTransactionsTable.id),
  actorId: text("actor_id").notNull().references(() => v2AccountsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("v2_points_account_page_idx").on(t.accountId, t.sequence),
  uniqueIndex("v2_points_source_reference_idx").on(t.source, t.reference),
]);

export const v2PointsEventsTable = pgTable("v2_points_events", {
  sequence: bigserial("sequence", { mode: "bigint" }).primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => v2PointsTransactionsTable.id),
  status: text("status").notNull(),
  delta: integer("delta").notNull(),
  reservedDelta: integer("reserved_delta").notNull(),
  reason: text("reason").notNull(),
  actorId: text("actor_id").notNull().references(() => v2AccountsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("v2_points_event_latest_idx").on(t.transactionId, t.sequence)]);

export const v2PointsRequestsTable = pgTable("v2_points_requests", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  transactionId: uuid("transaction_id").notNull().references(() => v2PointsTransactionsTable.id),
  actorId: text("actor_id").notNull().references(() => v2AccountsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
