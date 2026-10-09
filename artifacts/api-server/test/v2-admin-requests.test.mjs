import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { applyV2Migrations, createTestBudget } from "./fixtures.mjs";

// Isolated PostgreSQL schema. Verifies the high-risk request queue: cooldown, single execution,
// immutability, self-benefit protection and dual control.
const out = new URL("../.cache/v2-admin-requests-test.mjs", import.meta.url);
await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
await build({
  stdin: { contents: 'export * from "./src/v2/admin-requests"; export * from "./src/v2/points"; export { pool } from "@workspace/db";',
    resolveDir: new URL("../", import.meta.url).pathname, loader: "ts" },
  outfile: out.pathname, bundle: true, platform: "node", format: "esm", external: ["pg-native"],
  banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
});
const { createAdminRequestService, createPointsLedger, pool } = await import(out.href);
const schema = `admin_requests_test_${randomUUID().replaceAll("-", "")}`;
const isolated = new pool.constructor({ ...pool.options, options: `-c search_path=${schema}`, max: 8 });
let now = Date.now();
const queue = createAdminRequestService(isolated, { clock: () => now });
const ledger = createPointsLedger(isolated);
const later = () => { now = Date.now() + 61 * 60 * 1000; };
const reset = () => { now = Date.now(); };
const reason = "Kontrollert høyrisikohandling i isolert test";
const denied = status => e => e.status === status;
let admin, second, budget;
async function account(role = "USER") {
  const id = `test_${randomUUID()}`;
  await isolated.query(`INSERT INTO v2_accounts(id,email,first_name,last_name,role,referral_code,
    terms_version,privacy_version,terms_accepted_at,privacy_accepted_at,email_verified_at,last_session_id)
    VALUES($1,$2,'Test','Queue',$3,$1,'test','test',now(),now(),now(),'test')`, [id, `${id}@example.invalid`, role]);
  return id;
}
const ask = (actor, action, payload, extra = {}) => queue.request(actor, { action, payload, reason, requestKey: randomUUID(), ...extra });
const economy = (change = {}) => ({ defaultShareBp: 3000, maxShareBp: 4000, minMarginBp: 5000, highRiskCooldownMinutes: 60,
  highValueOrderPoints: 50000, dualControl: false, minAccountAgeDays: 7, minVerifiedPointsBeforeRedeem: 1000,
  maxRedemptionsPerDay: 3, maxRedeemPointsPerDay: 100000, ...change });

before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  await applyV2Migrations(isolated);
  admin = await account("SUPER_ADMIN");
  budget = await createTestBudget(isolated, admin);
  second = await account("ADMIN");
});
after(async () => {
  await isolated.end();
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
});

test("owner-approved economy defaults are seeded and bounded by the database", async () => {
  const row = (await isolated.query("SELECT * FROM v2_economy_config ORDER BY version DESC LIMIT 1")).rows[0];
  assert.equal(row.points_per_nok, 100);
  assert.equal(row.default_share_bp, 3000);
  assert.equal(row.max_share_bp, 4000);
  assert.equal(row.min_margin_bp, 5000);
  assert.equal(row.high_risk_cooldown_minutes, 60);
  const insert = (cols) => isolated.query(`INSERT INTO v2_economy_config(version,points_per_nok,default_share_bp,max_share_bp,
    min_margin_bp,high_risk_cooldown_minutes,high_value_order_points,dual_control,min_account_age_days,
    min_verified_points_before_redeem,max_redemptions_per_day,max_redeem_points_per_day,created_by)
    VALUES(99,$1,$2,$3,$4,$5,1,false,0,0,1,1,'test')`, cols);
  for (const cols of [[50, 3000, 4000, 5000, 60], [100, 3000, 4500, 5000, 60], [100, 4100, 4000, 5000, 60],
    [100, 3000, 4000, 4900, 60], [100, 3000, 4000, 5000, 59]]) {
    await assert.rejects(insert(cols), e => e.code === "23514");
  }
  await assert.rejects(isolated.query("UPDATE v2_economy_config SET max_share_bp=4000"), /append-only/);
});

test("a high-risk request waits at least 60 minutes and executes exactly once", async () => {
  reset();
  const user = await account();
  const r = await ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: 250, fundingBudgetId: budget });
  assert.equal(r.status, "pending");
  assert.ok(new Date(r.notBefore) - new Date(r.requestedAt) >= 60 * 60 * 1000);
  assert.equal(r.canConfirm, false);
  await assert.rejects(queue.confirm(admin, r.id), denied(409));
  assert.equal((await ledger.wallet(user)).balance, 0);
  later();
  const done = await queue.confirm(admin, r.id);
  assert.equal(done.status, "executed");
  assert.equal((await ledger.wallet(user)).balance, 250);
  await assert.rejects(queue.confirm(admin, r.id), denied(409));
  await assert.rejects(queue.confirm(second, r.id), denied(409));
  assert.equal((await ledger.wallet(user)).balance, 250);
  // Concurrent confirmations of a fresh request still execute once.
  reset();
  const r2 = await ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: 10, fundingBudgetId: budget });
  later();
  const results = await Promise.allSettled([queue.confirm(admin, r2.id), queue.confirm(second, r2.id), queue.confirm(admin, r2.id)]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  assert.equal((await ledger.wallet(user)).balance, 260);
});

test("requests are immutable, idempotent and cannot be tampered with", async () => {
  reset();
  const user = await account();
  const key = randomUUID();
  const a = await ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: 5, fundingBudgetId: budget }, { requestKey: key });
  const b = await ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: 5, fundingBudgetId: budget }, { requestKey: key });
  assert.equal(a.id, b.id);
  await assert.rejects(ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: 6, fundingBudgetId: budget }, { requestKey: key }), denied(409));
  await assert.rejects(ask(second, "POINTS_ADJUSTMENT", { accountId: user, amount: 5, fundingBudgetId: budget }, { requestKey: key }), denied(409));
  await assert.rejects(isolated.query("UPDATE v2_admin_requests SET payload='{\"amount\":999999}'::jsonb WHERE id=$1", [a.id]), /append-only/);
  await assert.rejects(isolated.query("UPDATE v2_admin_requests SET not_before=now() WHERE id=$1", [a.id]), /append-only/);
  await assert.rejects(isolated.query("DELETE FROM v2_admin_request_events WHERE request_id=$1", [a.id]), /append-only/);
  await assert.rejects(isolated.query(`INSERT INTO v2_admin_requests(id,action,payload,payload_hash,reason,requested_by,request_key,not_before)
    VALUES($1,'POINTS_ADJUSTMENT','{}',repeat('a',64),$2,$3,$4,now()+interval '5 minutes')`,
  [randomUUID(), reason, admin, randomUUID()]), e => e.code === "23514");
  for (const payload of [{ accountId: user }, { accountId: user, amount: 1.5 }, { accountId: user, amount: 5, extra: true }, null]) {
    await assert.rejects(ask(admin, "POINTS_ADJUSTMENT", payload), denied(400));
  }
  await assert.rejects(ask(admin, "UNKNOWN", {}), denied(400));
  await assert.rejects(ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: 5, fundingBudgetId: budget }, { reason: "kort" }), denied(400));
});

test("administrators can never request or approve their own financial benefit", async () => {
  reset();
  await assert.rejects(ask(admin, "POINTS_ADJUSTMENT", { accountId: admin, amount: 1000, fundingBudgetId: budget }), denied(403));
  await assert.rejects(isolated.query(`INSERT INTO v2_admin_requests(id,action,payload,payload_hash,target_account_id,reason,requested_by,request_key,not_before)
    VALUES($1,'POINTS_ADJUSTMENT','{}',repeat('a',64),$2,$3,$2,$4,now()+interval '2 hours')`,
  [randomUUID(), admin, reason, randomUUID()]), e => e.code === "23514");
  // Second admin asks for a credit to the first admin; the first admin cannot confirm it.
  const r = await ask(second, "POINTS_ADJUSTMENT", { accountId: admin, amount: 1000, fundingBudgetId: budget });
  later();
  await assert.rejects(queue.confirm(admin, r.id), denied(403));
  assert.equal((await ledger.wallet(admin)).balance, 0);
  // The ledger itself also blocks direct self-adjustment, decisions and compensation.
  await assert.rejects(ledger.execute({ kind: "adjust", accountId: admin, amount: 5, fundingBudgetId: budget, actorId: admin, reason,
    idempotencyKey: randomUUID() }), denied(403));
});

test("ordinary users cannot create, confirm or list requests", async () => {
  reset();
  const user = await account(), other = await account();
  await assert.rejects(ask(user, "POINTS_ADJUSTMENT", { accountId: other, amount: 5, fundingBudgetId: budget }), denied(403));
  const r = await ask(admin, "POINTS_ADJUSTMENT", { accountId: other, amount: 5, fundingBudgetId: budget });
  later();
  await assert.rejects(queue.confirm(user, r.id), denied(403));
  await assert.rejects(queue.list(user), denied(403));
});

test("cancelled and rejected requests can never execute", async () => {
  reset();
  const user = await account();
  const a = await ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: 5, fundingBudgetId: budget });
  assert.equal((await queue.reject(admin, a.id, { note: "Trukket tilbake av den som ba om det" })).status, "cancelled");
  const b = await ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: 5, fundingBudgetId: budget });
  assert.equal((await queue.reject(second, b.id, { note: "Avvist av annen administrator" })).status, "rejected");
  later();
  await assert.rejects(queue.confirm(admin, a.id), denied(409));
  await assert.rejects(queue.confirm(admin, b.id), denied(409));
  await assert.rejects(queue.reject(admin, a.id, { note: "Forsøk på ny avslutning" }), denied(409));
  assert.equal((await ledger.wallet(user)).balance, 0);
});

test("a failing execution rolls back and leaves the request pending", async () => {
  reset();
  const user = await account();
  const r = await ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: -50 });
  later();
  await assert.rejects(queue.confirm(admin, r.id), denied(409));
  assert.equal((await queue.view(admin, r.id)).status, "pending");
  assert.equal((await isolated.query("SELECT count(*)::int n FROM v2_points_requests WHERE idempotency_key=$1", [`adminreq:${r.id}`])).rows[0].n, 0);
});

test("generic decisions cannot touch offer or reward money", async () => {
  reset();
  const user = await account();
  const t = await ledger.execute({ kind: "record", accountId: user, type: "EARN", amount: 40, status: "pending", actorId: admin, reason, funding: { kind: "budget", reference: budget },
    source: "offer:test-partner", reference: randomUUID(), description: "Tilbudspoeng", idempotencyKey: randomUUID() });
  await assert.rejects(ask(admin, "POINTS_DECISION", { transactionId: t.transaction.id, status: "approved" }), denied(409));
  const generic = await ledger.execute({ kind: "record", accountId: user, type: "BONUS", amount: 40, status: "pending", actorId: admin, reason, funding: { kind: "budget", reference: budget },
    source: "verified-test", reference: randomUUID(), description: "Testbonus", idempotencyKey: randomUUID() });
  const r = await ask(admin, "POINTS_DECISION", { transactionId: generic.transaction.id, status: "approved" });
  later();
  await queue.confirm(admin, r.id);
  assert.equal((await ledger.wallet(user)).balance, 40);
});

test("economy changes go through the queue, stay within limits and can enable dual control", async () => {
  reset();
  await assert.rejects(ask(admin, "ECONOMY_CONFIG", economy({ maxShareBp: 4500 })), denied(400));
  await assert.rejects(ask(admin, "ECONOMY_CONFIG", economy({ defaultShareBp: 4100 })), denied(400));
  await assert.rejects(ask(admin, "ECONOMY_CONFIG", economy({ minMarginBp: 4000 })), denied(400));
  await assert.rejects(ask(admin, "ECONOMY_CONFIG", economy({ highRiskCooldownMinutes: 30 })), denied(400));
  const r = await ask(admin, "ECONOMY_CONFIG", economy({ dualControl: true, defaultShareBp: 3500 }));
  later();
  await queue.confirm(admin, r.id);
  const cfg = (await isolated.query("SELECT * FROM v2_economy_config ORDER BY version DESC LIMIT 1")).rows[0];
  assert.equal(cfg.version, 2);
  assert.equal(cfg.default_share_bp, 3500);
  assert.equal(cfg.dual_control, true);
  // With dual control, the requester cannot confirm their own request.
  reset();
  const user = await account();
  const q = await ask(admin, "POINTS_ADJUSTMENT", { accountId: user, amount: 7, fundingBudgetId: budget });
  later();
  assert.equal((await queue.view(admin, q.id)).canConfirm, false);
  await assert.rejects(queue.confirm(admin, q.id), denied(403));
  await queue.confirm(second, q.id);
  assert.equal((await ledger.wallet(user)).balance, 7);
  const audits = (await isolated.query(`SELECT action FROM v2_audit_logs WHERE entity_type='ADMIN_REQUEST' AND entity_id=$1 ORDER BY created_at`, [q.id])).rows;
  assert.deepEqual(audits.map(a => a.action), ["ADMIN_REQUEST_CREATED", "ADMIN_REQUEST_EXECUTED"]);
});
