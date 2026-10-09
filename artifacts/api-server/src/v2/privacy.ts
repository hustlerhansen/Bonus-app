import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { PointsError } from "./points";

type Database = Pick<typeof pool, "query" | "connect">;

/** GDPR access/portability export. Gift-card codes are excluded (revealed separately and logged). */
export async function exportAccountData(db: Database, accountId: string) {
  const q = async (sql: string) => (await db.query(sql, [accountId])).rows;
  const [account] = await q(`SELECT id,email,first_name,last_name,country,language,role,status,referral_code,terms_version,
    privacy_version,terms_accepted_at,privacy_accepted_at,email_verified_at,created_at,last_login_at FROM v2_accounts WHERE id=$1`);
  if (!account) throw new PointsError(404, "Kontoen finnes ikke.");
  return {
    exportedAt: new Date().toISOString(),
    note: "Utlevering av personopplysninger og transaksjonshistorikk fra BONUSPLAY. Gavekortkoder vises bare i appen.",
    account,
    consents: await q("SELECT kind,version,accepted_at FROM v2_consents WHERE account_id=$1 ORDER BY accepted_at"),
    pointsTransactions: await q(`SELECT t.id,t.type,t.amount,t.source,t.description,t.reason,t.created_at,
      (SELECT jsonb_agg(jsonb_build_object('status',e.status,'delta',e.delta,'reservedDelta',e.reserved_delta,'createdAt',e.created_at) ORDER BY e.sequence)
        FROM v2_points_events e WHERE e.transaction_id=t.id) AS events
      FROM v2_points_transactions t WHERE t.account_id=$1 ORDER BY t.sequence`),
    offerClicks: await q("SELECT id,offer_id,points,created_at FROM v2_offer_clicks WHERE account_id=$1 ORDER BY created_at"),
    conversions: await q(`SELECT v.id,c.offer_id,v.status,v.partner_status,v.created_at,v.updated_at FROM v2_offer_conversions v
      JOIN v2_offer_clicks c ON c.id=v.click_id WHERE c.account_id=$1 ORDER BY v.created_at`),
    rewardOrders: await q(`SELECT o.id,r.title,o.points,o.status,o.created_at,o.updated_at FROM v2_reward_orders o
      JOIN v2_rewards r ON r.id=o.reward_id WHERE o.account_id=$1 ORDER BY o.sequence`),
    xp: await q("SELECT kind,xp,oslo_day,created_at FROM v2_xp_events WHERE account_id=$1 ORDER BY id"),
    activityLog: await q(`SELECT action,entity_type,created_at FROM v2_audit_logs WHERE actor_id=$1 OR entity_id=$1
      ORDER BY created_at DESC LIMIT 1000`),
  };
}

/**
 * Deletion request: access stops immediately (status DELETION_REQUESTED). Personal data is then
 * erased or anonymised by an operator; bookkeeping records are retained as required by law.
 */
export async function requestDeletion(db: Database, accountId: string) {
  const c: PoolClient = await db.connect();
  try {
    await c.query("BEGIN");
    const a = (await c.query("SELECT role,status FROM v2_accounts WHERE id=$1 FOR UPDATE", [accountId])).rows[0];
    if (!a || a.status !== "ACTIVE") throw new PointsError(409, "Kontoen er ikke aktiv.");
    if (["ADMIN", "SUPER_ADMIN"].includes(a.role)) throw new PointsError(409, "Administratorkontoer avsluttes av operatør.");
    await c.query("UPDATE v2_accounts SET status='DELETION_REQUESTED' WHERE id=$1", [accountId]);
    await c.query(`INSERT INTO v2_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,'ACCOUNT_DELETION_REQUESTED','ACCOUNT',$2,'{}')`, [randomUUID(), accountId, a.role]);
    await c.query("DELETE FROM v2_demo_testers WHERE account_id=$1", [accountId]);
    await c.query("COMMIT");
    return { ok: true };
  } catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
}
