import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const activitiesTable = pgTable("activities", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  points: integer("points").notNull(),
  xp: integer("xp").notNull(),
  gems: integer("gems").notNull().default(5),
  minutes: integer("minutes").notNull().default(0),
  dailyLimit: integer("daily_limit").notNull().default(1),
  enabled: boolean("enabled").notNull().default(true),
});
export const rewardsTable = pgTable("rewards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  cost: integer("cost").notNull(),
  nokAmount: integer("nok_amount").notNull(),
  category: text("category").notNull(),
  available: boolean("available").notNull().default(true),
});
export const insertActivitySchema = createInsertSchema(activitiesTable);
export const insertRewardSchema = createInsertSchema(rewardsTable);
export type Activity = typeof activitiesTable.$inferSelect;
