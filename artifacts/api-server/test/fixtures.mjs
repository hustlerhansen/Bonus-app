import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Every V2 migration in order; the legacy demo baseline is not needed by V2 tests.
const dir = new URL("../../../lib/db/migrations/", import.meta.url);
export async function applyV2Migrations(db) {
  for (const name of (await readdir(dir)).filter(n => /^\d{4}_v2_.*\.sql$/.test(n)).sort()) {
    await db.query(await readFile(new URL(name, dir), "utf8"));
  }
}

/** Approved marketing budget for funding test credits (created as if via an executed high-risk request). */
export async function createTestBudget(db, adminId, pointsTotal = 10_000_000) {
  const request = randomUUID(), id = randomUUID();
  await db.query(`INSERT INTO v2_admin_requests(id,action,payload,payload_hash,reason,requested_by,request_key,requested_at,not_before)
    VALUES($1,'MARKETING_BUDGET','{}',repeat('a',64),'Isolert testfinansiering av poeng',$2,$3,now()-interval '2 hours',now()-interval '1 hour')`,
  [request, adminId, randomUUID()]);
  await db.query(`INSERT INTO v2_marketing_budgets(id,name,purpose,points_total,valid_until,approved_by,request_id)
    VALUES($1,'Testbudsjett','Isolert testfinansiering av poeng',$2,now()+interval '30 days',$3,$4)`, [id, pointsTotal, adminId, request]);
  return id;
}
