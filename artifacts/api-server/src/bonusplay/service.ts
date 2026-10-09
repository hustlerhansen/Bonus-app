import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import {
  db, pool, usersTable, activitiesTable, rewardsTable, walletTransactionsTable,
  redemptionsTable, featureFlagsTable, activityClaimsTable, eventsTable, notificationReadsTable,
  userAchievementsTable, fraudEventsTable, auditLogsTable, revenueEventsTable, type PoolClient,
} from "@workspace/db";
import { GetBonusplayStateResponse } from "@workspace/api-zod";
import type { DemoIdentity } from "./session";
import { leaderboardNames, leaderboardScores } from "./catalog";
import { providers } from "./providers";
import { seedWallet } from "./seed";

export class DemoError extends Error {
  constructor(public status: number, message: string, public body?: Record<string, unknown>) { super(message); }
}
type Client = PoolClient;
export function osloDay(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
}
function yesterday(day: string): string {
  return new Date(new Date(`${day}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
}

export async function getState(identity: DemoIdentity) {
  const [users, activities, wallet, rewards, redemptions, flags, allClaims, events, reads, storedAchievements] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, identity.userId)),
    db.select().from(activitiesTable),
    db.select().from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, identity.userId)).orderBy(desc(walletTransactionsTable.createdAt)),
    db.select().from(rewardsTable),
    db.select().from(redemptionsTable).where(eq(redemptionsTable.userId, identity.userId)).orderBy(desc(redemptionsTable.createdAt)),
    db.select().from(featureFlagsTable),
    db.select().from(activityClaimsTable).where(eq(activityClaimsTable.userId, identity.userId)),
    db.select().from(eventsTable).where(eq(eventsTable.enabled, true)),
    db.select().from(notificationReadsTable).where(eq(notificationReadsTable.userId, identity.userId)),
    db.select().from(userAchievementsTable).where(eq(userAchievementsTable.userId, identity.userId)),
  ]);
  const user = users[0];
  if (!user) throw new DemoError(401, "Start en ny demoøkt.");
  const points = wallet.filter(t => t.currency === "points").reduce((sum, t) => sum + t.amount, 0);
  const gems = wallet.filter(t => t.currency === "gems").reduce((sum, t) => sum + t.amount, 0);
  const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" });
  const claims = allClaims.filter(c => dateFormat.format(c.createdAt) === osloDay());
  const completed = new Set(claims.map(c => c.activityId));
  const readIds = new Set(reads.map(r => r.notificationId));
  const unlockedIds = new Set(storedAchievements.map(a => a.achievementId));
  const earned = Math.max(0, user.totalPointsEarned - 34550);
  const rank = Math.max(1, 247 - Math.floor(earned / 100));
  const achievements = [
    { id: "first-week", title: "Første uke", description: "Bygg en streak på 7 dager", progress: user.streak, target: 7 },
    { id: "gamer", title: "Spiller", description: "Spill 10 minispill", progress: user.gamesPlayed, target: 10 },
    { id: "viewer", title: "Videofan", description: "Se 20 videoannonser", progress: 12 + allClaims.filter(c => c.activityId === "mission-ad").length, target: 20 },
    { id: "champion", title: "Mester", description: "Nå topp 10 på resultatlisten", progress: rank <= 10 ? 1 : 0, target: 1 },
    { id: "social", title: "Sosial", description: "Inviter 5 aktive venner", progress: user.activeReferrals, target: 5 },
    { id: "first-reward", title: "Første belønning", description: "Bestill din første demobelønning", progress: redemptions.length, target: 1 },
    { id: "explorer", title: "Utforsker", description: "Fullfør 5 oppgaver", progress: allClaims.filter(c => c.activityId.startsWith("mission-")).length, target: 5 },
    { id: "silver", title: "Sølvnivå", description: "Nå nivå 10", progress: user.level, target: 10 },
    { id: "collector", title: "Poengsamler", description: "Tjen 10 000 poeng totalt", progress: user.totalPointsEarned, target: 10000 },
    { id: "survey-expert", title: "Meningsmester", description: "Fullfør 5 undersøkelser", progress: user.surveysCompleted, target: 5 },
  ].map(a => ({ ...a, progress: unlockedIds.has(a.id) ? a.target : Math.min(a.progress, a.target), unlocked: unlockedIds.has(a.id) || a.progress >= a.target }));
  const weekStart = new Date(`${osloDay()}T12:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
  const periodScores = (start: string, factor: number, base: number) => {
    const newPoints = wallet.filter(t => t.currency === "points" && t.amount > 0 && t.source !== "SEED" && dateFormat.format(t.createdAt) >= start).reduce((sum, t) => sum + t.amount, 0);
    return [
      ...leaderboardNames.slice(0, 19).map((name, i) => ({ rank: i + 1, name, points: Math.round((leaderboardScores[i] ?? 0) * factor), isCurrentUser: false })),
      { rank, name: user.displayName, points: base + newPoints, isCurrentUser: true },
    ];
  };
  const leaderboards = {
    day: periodScores(osloDay(), 0.1, 245),
    week: periodScores(weekStart.toISOString().slice(0, 10), 0.4, 980),
    month: periodScores(`${osloDay().slice(0, 7)}-01`, 1, 2450),
  };
  const eventProgress = events.map(event => ({ id: event.id, title: event.title, gems, target: event.target, secondsRemaining: Math.max(0, Math.floor((event.endsAt.getTime() - Date.now()) / 1000)) }));
  return GetBonusplayStateResponse.parse({
    user: {
      id: user.id, displayName: user.displayName, role: identity.role, points, gems, xp: user.xp, level: user.level,
      xpTarget: 1500, streak: user.streak, achievementsUnlocked: achievements.filter(a => a.unlocked).length,
      totalPointsEarned: user.totalPointsEarned, gamesPlayed: user.gamesPlayed,
      surveysCompleted: user.surveysCompleted, activeReferrals: user.activeReferrals,
    },
    missions: activities.filter(a => a.category === "mission").map(a => ({
      id: a.id, title: a.title, description: a.description, type: a.type, points: a.points, xp: a.xp, enabled: a.enabled,
      completed: a.id === "mission-streak" ? user.lastDailyClaim === osloDay() : completed.has(a.id === "mission-referral" ? "referral-active" : a.id),
    })),
    surveys: activities.filter(a => a.category === "survey" && a.enabled).map(a => ({ id: a.id, title: a.title, minutes: a.minutes, points: a.points, xp: a.xp, completed: completed.has(a.id) })),
    offers: activities.filter(a => a.category === "offer" && a.enabled).map(a => ({ id: a.id, title: a.title, description: a.description, points: a.points, xp: a.xp, completed: completed.has(a.id) })),
    transactions: wallet.map(t => ({ id: t.id, amount: t.amount, currency: t.currency, title: t.title, createdAt: t.createdAt.toISOString() })),
    rewards,
    redemptions: redemptions.map(r => ({ id: r.id, rewardTitle: r.rewardTitle, nokAmount: r.nokAmount, points: r.points, status: r.status, createdAt: r.createdAt.toISOString() })),
    leaderboard: leaderboards.month,
    leaderboards,
    achievements,
    notifications: [
      { id: "streak", message: "Ikke mist streaken din! Dagens bonus venter.", read: user.lastDailyClaim === osloDay() },
      { id: "reward", message: "Dagens belønning er klar.", read: user.lastDailyClaim === osloDay() },
      { id: "event", message: "Weekend Drop har startet. Samle diamanter!", read: false },
      { id: "rank", message: `Du ligger på plass ${rank} på resultatlisten.`, read: false },
      { id: "balance", message: points >= 10000 ? "Du har nok poeng til en demobelønning." : "Fortsett å spille for å nå din neste belønning.", read: false },
    ].map(n => ({ ...n, read: n.read || readIds.has(n.id) })),
    event: eventProgress.find(e => e.id === "weekend-drop") ?? eventProgress[0] ?? { id: "paused", title: "Ingen aktive arrangementer", gems, target: 500, secondsRemaining: 0 },
    events: eventProgress,
    featureFlags: flags,
    lastDailyClaim: user.lastDailyClaim,
  });
}

async function ledger(client: Client, userId: string, amount: number, currency: string, title: string, source: string, sourceId: string, key: string): Promise<void> {
  if (amount === 0) return;
  await client.query(
    "INSERT INTO wallet_transactions (id,user_id,amount,currency,title,source,source_id,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [randomUUID(), userId, amount, currency, title, source, sourceId, key],
  );
}
async function requireFlag(client: Client, key: string): Promise<void> {
  const result = await client.query("SELECT enabled FROM feature_flags WHERE key=$1", [key]);
  if (!result.rows[0]?.enabled) throw new DemoError(409, "Denne funksjonen er deaktivert av demoadministratoren.");
}
async function audit(client: Client, actor: string, action: string, sourceId: string): Promise<void> {
  await client.query("INSERT INTO audit_logs (id,actor,action,source_id) VALUES ($1,$2,$3,$4)", [randomUUID(), actor, action, sourceId]);
}
async function advanceXp(client: Client, userId: string, xp: number, points: number, category: string, type: string, key: string): Promise<number> {
  const result = await client.query("SELECT xp,level FROM users WHERE id=$1", [userId]);
  let nextXp = result.rows[0].xp + xp;
  let level = result.rows[0].level;
  let levelBonus = 0;
  while (nextXp >= 1500) { nextXp -= 1500; level += 1; levelBonus += 100; }
  if (levelBonus) await ledger(client, userId, levelBonus, "points", `Nivå ${level} – nivåbonus`, "LEVEL", String(level), `${key}:level`);
  await client.query(
    "UPDATE users SET xp=$2,level=$3,total_points_earned=total_points_earned+$4,games_played=games_played+$5,surveys_completed=surveys_completed+$6,active_referrals=active_referrals+$7 WHERE id=$1",
    [userId, nextXp, level, points + levelBonus, category === "game" ? 1 : 0, type === "SURVEY" ? 1 : 0, category === "referral" ? 1 : 0],
  );
  await unlockAchievements(client, userId);
  return levelBonus;
}

async function unlockAchievements(client: Client, userId: string): Promise<void> {
  const result = await client.query("SELECT * FROM users WHERE id=$1", [userId]);
  const user = result.rows[0];
  const counts = await client.query("SELECT COUNT(*) FILTER (WHERE activity_id='mission-ad')::int AS ads, COUNT(*) FILTER (WHERE activity_id LIKE 'mission-%')::int AS missions FROM activity_claims WHERE user_id=$1", [userId]);
  const redeemed = await client.query("SELECT id FROM redemptions WHERE user_id=$1 LIMIT 1", [userId]);
  const ids = [
    user.streak >= 7 && "first-week", user.games_played >= 10 && "gamer",
    counts.rows[0].ads + 12 >= 20 && "viewer", user.total_points_earned - 34550 >= 23700 && "champion",
    user.active_referrals >= 5 && "social", redeemed.rowCount && "first-reward",
    counts.rows[0].missions >= 5 && "explorer", user.level >= 10 && "silver",
    user.total_points_earned >= 10000 && "collector", user.surveys_completed >= 5 && "survey-expert",
  ].filter((id): id is string => typeof id === "string");
  for (const id of ids) await client.query("INSERT INTO user_achievements (user_id,achievement_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [userId, id]);
}

export async function claimActivity(identity: DemoIdentity, rawId: string, key: string) {
  if (rawId === "mission-streak") return claimDaily(identity);
  const activityId = rawId === "mission-referral" ? "referral-active" : rawId;
  const client = await pool.connect();
  let points = 0, xp = 0, gems = 0;
  let replay = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [identity.userId]);
    const old = await client.query("SELECT activity_id FROM activity_claims WHERE user_id=$1 AND idempotency_key=$2", [identity.userId, key]);
    if (old.rows[0]) {
      if (old.rows[0].activity_id !== activityId) throw new DemoError(409, "Denne forespørselen er allerede brukt.");
      replay = true;
    } else {
      const result = await client.query("SELECT * FROM activities WHERE id=$1 AND enabled=true", [activityId]);
      const a = result.rows[0];
      if (!a) throw new DemoError(400, "Aktiviteten finnes ikke eller er deaktivert.");
      const flag = a.category === "game" ? "GAMES" : a.category === "chest" ? "CHESTS" : a.type === "WATCH_AD" ? "ADS" : a.type === "SURVEY" ? "SURVEYS" : a.type === "OFFER" ? "OFFERS" : a.type === "REFERRAL" ? "REFERRALS" : null;
      if (flag) await requireFlag(client, flag);
      const counts = await client.query("SELECT COUNT(*)::int AS count,MAX(created_at) AS latest FROM activity_claims WHERE user_id=$1 AND activity_id=$2 AND (created_at AT TIME ZONE 'Europe/Oslo')::date=$3::date", [identity.userId, activityId, osloDay()]);
      if (counts.rows[0].count >= a.daily_limit) throw new DemoError(409, "Du har hentet alle bonusene for denne aktiviteten i dag.");
      if (a.category === "game" && counts.rows[0].latest && Date.now() - new Date(counts.rows[0].latest).getTime() < 20000) throw new DemoError(409, "Ta en kort pause. Neste spillbonus er klar om 20 sekunder.");
      if (["mission-game", "mission-memory", "mission-reaction"].includes(activityId)) {
        const required = activityId === "mission-memory" ? "game-memory" : activityId === "mission-reaction" ? "game-reaction" : "game-%";
        const played = await client.query("SELECT id FROM activity_claims WHERE user_id=$1 AND activity_id LIKE $2 AND (created_at AT TIME ZONE 'Europe/Oslo')::date=$3::date LIMIT 1", [identity.userId, required, osloDay()]);
        if (!played.rowCount) throw new DemoError(409, "Fullfør spillet først, og hent deretter oppgavebonusen.");
      }
      const velocity = await client.query("SELECT COUNT(*)::int AS count FROM activity_claims WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 minute'", [identity.userId]);
      if (velocity.rows[0].count >= 12) throw new DemoError(429, "Du har fullført mange aktiviteter. Vent ett minutt før neste bonus.");
      points = a.points; xp = a.xp; gems = a.gems;
      await client.query("INSERT INTO activity_claims (id,user_id,activity_id,idempotency_key,points,xp,gems) VALUES ($1,$2,$3,$4,$5,$6,$7)", [randomUUID(), identity.userId, activityId, key, points, xp, gems]);
      await ledger(client, identity.userId, points, "points", a.title, a.type, activityId, key);
      await ledger(client, identity.userId, gems, "gems", `${a.title} – diamanter`, a.type, activityId, key);
      points += await advanceXp(client, identity.userId, xp, points, a.category, a.type, key);
      const provider = a.type === "WATCH_AD" ? providers.ad : a.type === "SURVEY" ? providers.survey : a.type === "OFFER" ? providers.offer : null;
      if (provider) {
        const economics = await provider.verifyCompletion(activityId, points);
        if (!economics.verified) throw new DemoError(400, "Leverandøren kunne ikke bekrefte aktiviteten.");
        if (!economics.providerEventId || !Number.isSafeInteger(economics.grossRevenueOre) || !Number.isSafeInteger(economics.providerCostOre) || economics.providerCostOre < 0 || economics.grossRevenueOre - economics.providerCostOre < points) {
          throw new DemoError(503, "Aktiviteten er midlertidig satt på pause av budsjettkontrollen.");
        }
        await client.query("INSERT INTO revenue_events (id,user_id,source_id,gross_revenue_ore,provider_cost_ore,reward_cost_ore,contribution_ore,provider_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(), identity.userId, activityId, economics.grossRevenueOre, economics.providerCostOre, points, economics.grossRevenueOre - economics.providerCostOre - points, economics.providerEventId]);
      }
      const event = a.type === "WATCH_AD" ? "ad_completed" : a.type === "SURVEY" ? "survey_completed" : a.type === "OFFER" ? "offer_completed" : a.category === "game" ? "game_completed" : a.category === "referral" ? "referral_completed" : "mission_completed";
      await client.query("INSERT INTO analytics_events (id,user_id,event,source_id) VALUES ($1,$2,$3,$4)", [randomUUID(), identity.userId, event, activityId]);
      if (a.category === "mission" && event !== "mission_completed") await client.query("INSERT INTO analytics_events (id,user_id,event,source_id) VALUES ($1,$2,'mission_completed',$3)", [randomUUID(), identity.userId, activityId]);
      await audit(client, identity.userId, "REWARD_CLAIMED", activityId);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error && typeof error === "object" && "code" in error && error.code === "23505" && "constraint" in error && String(error.constraint).includes("provider_event_id")) {
      await client.query("INSERT INTO fraud_events (id,user_id,reason,risk_score) VALUES ($1,$2,$3,40)", [randomUUID(), identity.userId, "Duplikat leverandørhendelse"]);
      throw new DemoError(409, "Leverandørhendelsen er allerede behandlet.");
    }
    if (error instanceof DemoError && [409, 429].includes(error.status)) {
      await client.query("INSERT INTO fraud_events (id,user_id,reason,risk_score) VALUES ($1,$2,$3,$4)", [randomUUID(), identity.userId, error.message, error.status === 429 ? 40 : 5]);
    }
    throw error;
  } finally { client.release(); }
  return { state: await getState(identity), pointsEarned: points, xpEarned: xp, gemsEarned: gems, message: replay ? "Denne bonusen er allerede hentet." : "Bra jobbet! Bonusen er lagt til i lommeboken." };
}

export async function claimDaily(identity: DemoIdentity) {
  const client = await pool.connect();
  let points = 0;
  const today = osloDay();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [identity.userId]);
    const user = result.rows[0];
    if (user.last_daily_claim && String(user.last_daily_claim).slice(0, 10) === today) throw new DemoError(409, "Du har allerede hentet dagens streakbonus.");
    const last = user.last_daily_claim instanceof Date ? user.last_daily_claim.toISOString().slice(0, 10) : user.last_daily_claim;
    if (last === today) throw new DemoError(409, "Du har allerede hentet dagens streakbonus.");
    const streak = !last || last === yesterday(today) ? user.streak + 1 : 1;
    const settings = await client.query("SELECT points,enabled FROM activities WHERE id='mission-streak'");
    if (!settings.rows[0]?.enabled) throw new DemoError(409, "Streakbonusen er midlertidig deaktivert.");
    points = [50, 75, 100, 125, 150, 200, settings.rows[0].points][(streak - 1) % 7];
    const key = `daily:${today}`;
    await ledger(client, identity.userId, points, "points", `Streakbonus – dag ${streak}`, "STREAK", today, key);
    await ledger(client, identity.userId, 5, "gems", "Streakbonus – diamanter", "STREAK", today, key);
    await client.query("UPDATE users SET streak=$2,last_daily_claim=$3 WHERE id=$1", [identity.userId, streak, today]);
    points += await advanceXp(client, identity.userId, 50, points, "streak", "STREAK", key);
    await audit(client, identity.userId, "DAILY_REWARD", today);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return { state: await getState(identity), pointsEarned: points, xpEarned: 50, gemsEarned: 5, message: "Dagens streakbonus er din!" };
}

export async function redeem(identity: DemoIdentity, rewardId: string, key: string) {
  const client = await pool.connect();
  let replay = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [identity.userId]);
    await requireFlag(client, "REDEMPTIONS");
    const existing = await client.query("SELECT reward_id FROM redemptions WHERE user_id=$1 AND idempotency_key=$2", [identity.userId, key]);
    if (existing.rows[0]) {
      if (existing.rows[0].reward_id !== rewardId) throw new DemoError(409, "Denne forespørselen er allerede brukt.");
      replay = true;
    } else {
      const result = await client.query("SELECT * FROM rewards WHERE id=$1 AND available=true", [rewardId]);
      const reward = result.rows[0];
      if (!reward) throw new DemoError(400, "Belønningen er ikke tilgjengelig.");
      const balance = await client.query("SELECT COALESCE(SUM(amount),0)::int AS points FROM wallet_transactions WHERE user_id=$1 AND currency='points'", [identity.userId]);
      if (balance.rows[0].points < reward.cost) throw new DemoError(409, "Du har ikke nok poeng til denne belønningen.");
      const risk = await client.query("SELECT COALESCE(SUM(risk_score),0)::int AS score FROM fraud_events WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 day'", [identity.userId]);
      const id = randomUUID();
      const status = risk.rows[0].score > 60 ? "MANUAL_REVIEW" : (await providers.reward.orderReward(id)).status;
      await client.query("INSERT INTO redemptions (id,user_id,reward_id,reward_title,nok_amount,points,status,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, identity.userId, rewardId, reward.title, reward.nok_amount, reward.cost, status, key]);
      await ledger(client, identity.userId, -reward.cost, "points", `${reward.title} ${reward.nok_amount} kr – demo`, "REDEMPTION", id, key);
      await audit(client, identity.userId, "DEMO_REDEMPTION", id);
      await client.query("INSERT INTO analytics_events (id,user_id,event,source_id) VALUES ($1,$2,'redemption_completed',$3)", [randomUUID(), identity.userId, id]);
      await unlockAchievements(client, identity.userId);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return { state: await getState(identity), pointsEarned: 0, xpEarned: 0, gemsEarned: 0, message: replay ? "Demobelønningen er allerede bestilt." : "Demobelønning bestilt! Ingen penger eller gavekort sendes." };
}

export async function resetAccount(identity: DemoIdentity) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [identity.userId]);
    for (const table of ["redemptions", "activity_claims", "wallet_transactions", "analytics_events", "fraud_events", "revenue_events", "notification_reads", "user_achievements"]) {
      await client.query(`DELETE FROM ${table} WHERE user_id=$1`, [identity.userId]);
    }
    await client.query("UPDATE users SET xp=1250,level=7,streak=6,last_daily_claim=NULL,total_points_earned=34550,games_played=27,surveys_completed=8,active_referrals=3 WHERE id=$1", [identity.userId]);
    await seedWallet(client, identity.userId);
    await audit(client, identity.userId, "DEMO_RESET", identity.userId);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return getState(identity);
}

export async function adminDashboard(identity: DemoIdentity) {
  const state = await getState(identity);
  const pending = await pool.query("SELECT COUNT(*)::int AS count FROM redemptions");
  const [users, redemptions, fraud, audits, revenue] = await Promise.all([
    db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(200),
    db.select().from(redemptionsTable).orderBy(desc(redemptionsTable.createdAt)).limit(100),
    db.select().from(fraudEventsTable).orderBy(desc(fraudEventsTable.createdAt)).limit(100),
    db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(100),
    db.select().from(revenueEventsTable).orderBy(desc(revenueEventsTable.createdAt)).limit(100),
  ]);
  const liability = await pool.query("SELECT COALESCE(SUM(amount),0)::int AS points FROM wallet_transactions WHERE currency='points'");
  return {
    metrics: [
      { label: "Brukere (demo)", value: "12 450" }, { label: "Daglig aktive (demo)", value: "3 240" },
      { label: "Omsetning i dag (demo)", value: "18 450 kr" }, { label: "Belønninger utstedt (demo)", value: "7 320 kr" },
      { label: "Bruttomargin (demo)", value: "42,2 %" }, { label: "Ventende demoordrer", value: String(pending.rows[0].count) },
      { label: "Annonseinntekter (demo)", value: "12 400 kr" }, { label: "Undersøkelsesinntekter (demo)", value: "8 500 kr" },
      { label: "Tilbudsinntekter (demo)", value: "14 200 kr" }, { label: "Totale inntekter (demo)", value: "35 100 kr" },
      { label: "Belønningskostnad (demo)", value: "14 700 kr" }, { label: "Andre variable kostnader (demo)", value: "5 600 kr" },
      { label: "Bruttobidrag (demo)", value: "14 800 kr" },
      { label: "ARPU (demo)", value: "2,82 kr" }, { label: "ARPDAU (demo)", value: "10,83 kr" },
      { label: "Belønningskostnad per bruker (demo)", value: "1,18 kr" },
      { label: "Inntekt per bruker (demo)", value: "2,82 kr" },
      { label: "Utestående demopoengverdi", value: `${(liability.rows[0].points / 100).toFixed(2).replace(".", ",")} kr` },
    ],
    featureFlags: state.featureFlags,
    missions: state.missions,
    users: users.map(u => ({ id: u.id, displayName: u.displayName, level: u.level, totalPointsEarned: u.totalPointsEarned, activeReferrals: u.activeReferrals, createdAt: u.createdAt.toISOString() })),
    redemptions: redemptions.map(r => ({ id: r.id, rewardTitle: r.rewardTitle, nokAmount: r.nokAmount, points: r.points, status: r.status, createdAt: r.createdAt.toISOString() })),
    fraudEvents: fraud.map(f => ({ ...f, createdAt: f.createdAt.toISOString() })),
    auditLogs: audits.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
    revenueEvents: revenue.map(r => ({ id: r.id, sourceId: r.sourceId, grossRevenueNok: r.grossRevenueOre / 100, providerCostNok: r.providerCostOre / 100, rewardCostNok: r.rewardCostOre / 100, contributionNok: r.contributionOre / 100, createdAt: r.createdAt.toISOString() })),
  };
}
