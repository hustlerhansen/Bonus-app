import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { PointsError } from "./points";

type Database = Pick<typeof pool, "query" | "connect">;
type Reader = Pick<PoolClient, "query">;

/** The private demo is open only to active, enrolled V2 accounts on the tester list. */
export async function demoAccess(db: Reader, accountId: string | null | undefined) {
  if (!accountId) return { tester: false, canAdmin: false };
  const row = (await db.query(`SELECT t.can_admin FROM v2_demo_testers t JOIN v2_accounts a ON a.id=t.account_id
    WHERE t.account_id=$1 AND a.status='ACTIVE'`, [accountId])).rows[0];
  return { tester: !!row, canAdmin: !!row?.can_admin };
}

export function createTesterService(database: Database = pool) {
  async function admin(c: Reader, id: string) {
    const a = (await c.query("SELECT id,role,status FROM v2_accounts WHERE id=$1", [id])).rows[0];
    if (!a || a.status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(a.role)) throw new PointsError(403, "Du har ikke tilgang til denne funksjonen.");
    return a as { id: string; role: string };
  }
  async function audit(c: Reader, actor: { id: string; role: string }, action: string, id: string, metadata: unknown) {
    await c.query(`INSERT INTO v2_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,$4,'DEMO_TESTER',$5,$6)`, [randomUUID(), actor.id, actor.role, action, id, JSON.stringify(metadata)]);
  }
  const projection = `t.account_id AS "accountId",a.email,trim(a.first_name || ' ' || a.last_name) AS name,
    t.can_admin AS "canAdmin",t.note,t.created_at AS "createdAt"`;
  const iso = (r: Record<string, unknown>) => ({ ...r, createdAt: (r.createdAt as Date).toISOString() });
  async function list(actorId: string) {
    await admin(database, actorId);
    const rows = (await database.query(`SELECT ${projection} FROM v2_demo_testers t JOIN v2_accounts a ON a.id=t.account_id
      ORDER BY t.created_at DESC`)).rows;
    return { items: rows.map(iso) };
  }
  async function add(actorId: string, input: { email: string; canAdmin: boolean; note: string }) {
    const c = await database.connect();
    try {
      await c.query("BEGIN");
      const actor = await admin(c, actorId);
      const target = (await c.query("SELECT id FROM v2_accounts WHERE email=$1 AND status='ACTIVE'", [input.email.trim().toLowerCase()])).rows[0];
      if (!target) throw new PointsError(404, "Fant ingen aktiv, registrert konto med denne e-postadressen.");
      await c.query(`INSERT INTO v2_demo_testers(account_id,can_admin,added_by,note) VALUES($1,$2,$3,$4)
        ON CONFLICT (account_id) DO UPDATE SET can_admin=EXCLUDED.can_admin,note=EXCLUDED.note`,
      [target.id, input.canAdmin, actorId, input.note.trim()]);
      await audit(c, actor, "DEMO_TESTER_SAVED", target.id, { canAdmin: input.canAdmin, note: input.note.trim() });
      const row = (await c.query(`SELECT ${projection} FROM v2_demo_testers t JOIN v2_accounts a ON a.id=t.account_id WHERE t.account_id=$1`, [target.id])).rows[0];
      await c.query("COMMIT");
      return iso(row);
    } catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
  }
  async function remove(actorId: string, accountId: string) {
    const c = await database.connect();
    try {
      await c.query("BEGIN");
      const actor = await admin(c, actorId);
      const r = await c.query("DELETE FROM v2_demo_testers WHERE account_id=$1", [accountId]);
      if (!r.rowCount) throw new PointsError(404, "Kontoen er ikke tester.");
      await audit(c, actor, "DEMO_TESTER_REMOVED", accountId, {});
      await c.query("COMMIT");
      return { ok: true };
    } catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
  }
  return { list, add, remove };
}
export const testers = createTesterService();
