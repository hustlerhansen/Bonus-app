import { pool, type PoolClient } from "@workspace/db";
import { PointsError } from "./points";

type Database = Pick<typeof pool, "query" | "connect">;
type Reader = Pick<PoolClient, "query">;

// XP, levels, streaks and badges are motivation only: no table here references the points ledger.
export const CHECKIN_XP = 10;
export const STREAK_STEP_XP = 5;
export const STREAK_MAX_BONUS_XP = 30;

/** Cumulative XP needed to reach a level: 0, 100, 300, 600, 1 000, ... */
export function levelFloor(level: number) { return 50 * level * (level - 1); }
export function levelFor(xp: number) {
  let level = 1;
  while (xp >= levelFloor(level + 1)) level++;
  return level;
}
export function levelName(level: number) {
  return level >= 20 ? "Platina" : level >= 10 ? "Gull" : level >= 5 ? "Sølv" : "Bronse";
}
/** Current streak: consecutive days ending today (or yesterday, before today's check-in). */
export function streakFrom(days: string[], today: string) {
  const set = new Set(days);
  const prev = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  let day = set.has(today) ? today : prev(today);
  let n = 0;
  while (set.has(day)) { n++; day = prev(day); }
  return n;
}
export function longestStreak(days: string[]) {
  const sorted = [...new Set(days)].sort();
  let best = 0, run = 0, last = "";
  for (const d of sorted) {
    run = last && Date.parse(`${d}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`) === 86400000 ? run + 1 : 1;
    best = Math.max(best, run); last = d;
  }
  return best;
}

export function createEngagementService(database: Database = pool) {
  async function active(client: Reader, accountId: string) {
    const a = (await client.query("SELECT status FROM v2_accounts WHERE id=$1", [accountId])).rows[0];
    if (!a) throw new PointsError(404, "V2-kontoen finnes ikke.");
    if (a.status !== "ACTIVE") throw new PointsError(403, "Kontoen er ikke aktiv.");
  }
  async function state(client: Reader, accountId: string, xpAwarded = 0) {
    const today = (await client.query("SELECT to_char((now() AT TIME ZONE 'Europe/Oslo')::date,'YYYY-MM-DD') AS d")).rows[0].d as string;
    const rows = (await client.query(`SELECT kind,xp,to_char(oslo_day,'YYYY-MM-DD') AS day FROM v2_xp_events WHERE account_id=$1`, [accountId])).rows;
    const xp = rows.reduce((sum, r) => sum + Number(r.xp), 0);
    const days = rows.filter(r => r.kind === "DAILY_CHECKIN").map(r => r.day as string);
    const offers = rows.filter(r => r.kind === "OFFER_VERIFIED").length;
    const delivered = (await client.query(`SELECT count(*)::int AS n FROM v2_reward_orders WHERE account_id=$1 AND status='delivered'`, [accountId])).rows[0].n;
    const level = levelFor(xp), longest = longestStreak(days);
    const badges = [
      { id: "first-checkin", title: "Første innsjekk", description: "Sjekk inn for første gang", earned: days.length > 0 },
      { id: "streak-7", title: "Ukesrekke", description: "Sjekk inn 7 dager på rad", earned: longest >= 7 },
      { id: "streak-30", title: "Månedsrekke", description: "Sjekk inn 30 dager på rad", earned: longest >= 30 },
      { id: "first-offer", title: "Første tilbud", description: "Få ditt første tilbud verifisert", earned: offers >= 1 },
      { id: "five-offers", title: "Tilbudsjeger", description: "Få 5 tilbud verifisert", earned: offers >= 5 },
      { id: "first-reward", title: "Første gavekort", description: "Motta ditt første gavekort", earned: delivered >= 1 },
      { id: "level-5", title: "Sølvnivå", description: "Nå nivå 5", earned: level >= 5 },
      { id: "level-10", title: "Gullnivå", description: "Nå nivå 10", earned: level >= 10 },
    ];
    return { xp, level, levelName: levelName(level), levelFloorXp: levelFloor(level), nextLevelXp: levelFloor(level + 1),
      streak: streakFrom(days, today), checkedInToday: days.includes(today), badges, xpAwarded };
  }
  async function get(accountId: string) {
    await active(database, accountId);
    return state(database, accountId);
  }
  async function checkIn(accountId: string) {
    const c = await database.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,20761015))", [accountId]);
      await active(c, accountId);
      const before = await state(c, accountId);
      let awarded = 0;
      if (!before.checkedInToday) {
        const day = (await c.query("SELECT to_char((now() AT TIME ZONE 'Europe/Oslo')::date,'YYYY-MM-DD') AS d")).rows[0].d;
        const streak = before.streak + 1;
        const bonus = Math.min((streak - 1) * STREAK_STEP_XP, STREAK_MAX_BONUS_XP);
        await c.query(`INSERT INTO v2_xp_events(account_id,kind,xp,reference,oslo_day) VALUES($1,'DAILY_CHECKIN',$2,$3,$4::date)
          ON CONFLICT DO NOTHING`, [accountId, CHECKIN_XP, day, day]);
        if (bonus > 0) await c.query(`INSERT INTO v2_xp_events(account_id,kind,xp,reference,oslo_day) VALUES($1,'STREAK_BONUS',$2,$3,$4::date)
          ON CONFLICT DO NOTHING`, [accountId, bonus, day, day]);
        awarded = CHECKIN_XP + bonus;
      }
      const after = await state(c, accountId, awarded);
      await c.query("COMMIT");
      return after;
    } catch (error) { await c.query("ROLLBACK"); throw error; }
    finally { c.release(); }
  }
  return { get, checkIn };
}
export const engagement = createEngagementService();
