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

/** Append an economy version (tests only), e.g. to relax redemption eligibility for fresh synthetic accounts. */
export async function setTestEconomy(db, overrides = {}) {
  const c = (await db.query("SELECT * FROM v2_economy_config ORDER BY version DESC LIMIT 1")).rows[0];
  const v = { ...c, ...overrides };
  await db.query(`INSERT INTO v2_economy_config(version,points_per_nok,default_share_bp,max_share_bp,min_margin_bp,
    high_risk_cooldown_minutes,high_value_order_points,dual_control,min_account_age_days,min_verified_points_before_redeem,
    max_redemptions_per_day,max_redeem_points_per_day,created_by) VALUES($1,100,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'test-fixture')`,
  [c.version + 1, v.default_share_bp, v.max_share_bp, v.min_margin_bp, v.high_risk_cooldown_minutes, v.high_value_order_points,
    v.dual_control, v.min_account_age_days, v.min_verified_points_before_redeem, v.max_redemptions_per_day, v.max_redeem_points_per_day]);
}
