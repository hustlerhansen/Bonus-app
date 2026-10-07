import { pgTable, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  xp: integer("xp").notNull().default(1250),
  level: integer("level").notNull().default(7),
  streak: integer("streak").notNull().default(6),
  lastDailyClaim: date("last_daily_claim", { mode: "string" }),
  totalPointsEarned: integer("total_points_earned").notNull().default(34550),
  gamesPlayed: integer("games_played").notNull().default(27),
  surveysCompleted: integer("surveys_completed").notNull().default(8),
  activeReferrals: integer("active_referrals").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertUserSchema = createInsertSchema(usersTable);
export type User = typeof usersTable.$inferSelect;
