import { pgTable, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("points"),
  title: text("title").notNull(),
  source: text("source").notNull(),
  sourceId: text("source_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("COMPLETED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("wallet_idempotency_currency_idx").on(table.userId, table.idempotencyKey, table.currency),
  index("wallet_user_created_idx").on(table.userId, table.createdAt),
]);
export const insertWalletTransactionSchema = createInsertSchema(walletTransactionsTable);
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
