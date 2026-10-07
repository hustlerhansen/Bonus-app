import { pgTable, text, integer, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const eventsTable = pgTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  target: integer("target").notNull().default(500),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
});
export const userAchievementsTable = pgTable("user_achievements", {
  userId: text("user_id").notNull().references(() => usersTable.id),
  achievementId: text("achievement_id").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.achievementId] })]);
export const notificationReadsTable = pgTable("notification_reads", {
  userId: text("user_id").notNull().references(() => usersTable.id),
  notificationId: text("notification_id").notNull(),
}, table => [primaryKey({ columns: [table.userId, table.notificationId] })]);
export const insertEventSchema = createInsertSchema(eventsTable);
export const insertUserAchievementSchema = createInsertSchema(userAchievementsTable);
export const insertNotificationReadSchema = createInsertSchema(notificationReadsTable);
