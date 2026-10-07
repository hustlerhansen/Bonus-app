import { randomUUID } from "node:crypto";
import { db, pool, usersTable, activitiesTable, rewardsTable, featureFlagsTable, eventsTable, type PoolClient } from "@workspace/db";
import { activityCatalog, rewardCatalog, featureKeys, leaderboardNames } from "./catalog";

export async function seedDemoCatalog(): Promise<void> {
  await db.insert(activitiesTable).values(activityCatalog).onConflictDoNothing();
  await db.insert(rewardsTable).values(rewardCatalog).onConflictDoNothing();
  await db.insert(featureFlagsTable).values(featureKeys.map(key => ({ key, enabled: true }))).onConflictDoNothing();
  await db.insert(usersTable).values(leaderboardNames.map((name, i) => ({ id: `leaderboard-${i}`, displayName: name }))).onConflictDoNothing();
  await db.insert(eventsTable).values([
    { id: "weekend-drop", title: "Weekend Drop", description: "Samle diamanter og lås opp milepæler.", target: 500, endsAt: new Date(Date.now() + 62 * 3600000) },
    { id: "autumn-quest", title: "Høstjakten", description: "Utforsk aktiviteter og bygg fremgang gjennom uken.", target: 1000, endsAt: new Date(Date.now() + 7 * 86400000) },
  ]).onConflictDoNothing();
}

export async function createDemoUser(id: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("INSERT INTO users (id,display_name) VALUES ($1,'Magnar') ON CONFLICT DO NOTHING RETURNING id", [id]);
    if (result.rowCount) {
      await seedWallet(client, id);
      await client.query("INSERT INTO analytics_events (id,user_id,event) VALUES ($1,$2,'signup')", [randomUUID(), id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type Client = PoolClient;

export async function seedWallet(client: Client, userId: string): Promise<void> {
  const entries = [
    { amount: 11630, title: "Tidligere opptjente poeng", currency: "points" },
    { amount: 150, title: "Undersøkelse", currency: "points" },
    { amount: 20, title: "Videoannonse", currency: "points" },
    { amount: 50, title: "Daglig oppgave", currency: "points" },
    { amount: 500, title: "Aktiv venn", currency: "points" },
    { amount: 100, title: "Streakbonus", currency: "points" },
    { amount: 135, title: "Weekend Drop – demostart", currency: "gems" },
  ];
  for (const [index, entry] of entries.entries()) {
    await client.query(
      "INSERT INTO wallet_transactions (id,user_id,amount,currency,title,source,source_id,idempotency_key,created_at) VALUES ($1,$2,$3,$4,$5,'SEED',$6,$6,NOW()-($7::int*INTERVAL '1 hour'))",
      [randomUUID(), userId, entry.amount, entry.currency, entry.title, `seed-${index}`, 7 - index],
    );
  }
}
