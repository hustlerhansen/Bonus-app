import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

const out = new URL("../.cache/v2-rewards-test.mjs", import.meta.url);
await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
await build({
  stdin: { contents: 'export * from "./src/v2/rewards"; export * from "./src/v2/points"; export * from "./src/v2/points-reconciliation"; export { pool } from "@workspace/db";',
    resolveDir: new URL("../", import.meta.url).pathname, loader: "ts" },
  outfile: out.pathname, bundle: true, platform: "node", format: "esm", external: ["pg-native"],
  banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
});
const { pool, createRewardService, createPointsLedger, createPointsReconciler } = await import(out.href);
const schema = `rewards_test_${randomUUID().replaceAll("-", "")}`;
const isolated = new pool.constructor({ ...pool.options, options: `-c search_path=${schema}`, max: 12 });
const service = createRewardService(isolated), ledger = createPointsLedger(isolated);
const reason = "Isolert test av kontrollert premieinnløsning";
const denied = status => e => e.status === status;
let admin;
async function account(role = "USER") {
  const id = `test_${randomUUID()}`;
  await isolated.query(`INSERT INTO v2_accounts(id,email,first_name,last_name,role,referral_code,
    terms_version,privacy_version,terms_accepted_at,privacy_accepted_at,email_verified_at,last_session_id)
    VALUES($1,$2,'Test','Rewards',$3,$1,'test','test',now(),now(),now(),'test')`, [id, `${id}@example.invalid`, role]);
  return id;
}
const input = (stock = 3) => ({ supplierId: "test-supplier", title: "Isolert syntetisk premie", description: "Kun isolert test, ingen ekte premie.",
  terms: "Ingen virkelig leverandør eller gavelevering.", points: 40, stock, supplierSku: "isolated-test",
  approvalReference: "Kun isolert godkjenningsfixture" });
const request = () => ({ idempotencyKey: randomUUID() });
const action = (a, key = randomUUID()) => ({ action: a, reason, evidenceReference: "Isolert bekreftet leveringsutfall",
  idempotencyKey: key, ...(a === "refund" ? { confirmedNotDelivered: true } : {}) });
async function fixture(stock = 3, balance = 100) {
  const user = await account(), reward = await service.create(admin, input(stock));
  await service.review(admin, reward.id, { status: "approved", reason });
  if (balance) await ledger.execute({ kind: "adjust", actorId: admin, accountId: user, amount: balance, reason, idempotencyKey: randomUUID() });
  return { user, reward };
}
before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  for (const file of ["0001_v2_identity.sql", "0002_v2_points.sql", "0003_v2_offers.sql", "0004_v2_rewards.sql"]) {
    await isolated.query(await readFile(new URL(`../../../lib/db/migrations/${file}`, import.meta.url), "utf8"));
  }
  admin = await account("ADMIN");
  await isolated.query(`INSERT INTO v2_reward_suppliers(id,name,agreement_reference,integration_actor_id,active)
    VALUES('test-supplier','Kun isolert syntetisk leverandør','Isolert avtaledokument',$1,true)`, [admin]);
});
after(async () => { await isolated.end(); await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); });

test("defaults closed, no fabricated catalog, security and commercial gates both required", async () => {
  const { user, reward } = await fixture();
  assert.equal((await service.list(user)).redeemEnabled, false);
  await assert.rejects(service.redeem(user, reward.id, request()), denied(503));
  await assert.rejects(isolated.query("UPDATE v2_redeem_gate SET enabled=true"), e => e.code === "23514");
  await isolated.query("UPDATE v2_redeem_gate SET enabled=true,commercial_reference='Isolert kommersiell kontroll'");
  await assert.rejects(service.redeem(user, reward.id, request()), denied(503));
  await isolated.query("UPDATE v2_earn_gate SET phase1_cleared=true,clearance_reference='Isolert sikkerhetskontroll'");
});
test("strict server prices, USER admin denial, drafts hidden and immutable economics", async () => {
  const { user, reward } = await fixture();
  for (const call of [() => service.create(user, input()), () => service.review(user, reward.id, { status: "disabled", reason }),
    () => service.orders(user, true), () => service.suppliers(user), () => service.reconcile(user)]) await assert.rejects(call, denied(403));
  await assert.rejects(service.redeem(user, reward.id, { ...request(), points: 1 }), denied(400));
  const draft = await service.create(admin, input());
  await assert.rejects(service.detail(user, draft.id), denied(404));
  await assert.rejects(service.redeem(user, draft.id, request()), denied(409));
  await assert.rejects(isolated.query("UPDATE v2_rewards SET points=1 WHERE id=$1", [reward.id]), /immutable/);
});
test("atomic reservation and same-key replay have one order, one stock unit and pending debit", async () => {
  const { user, reward } = await fixture(), key = request();
  const orders = await Promise.all(Array.from({ length: 6 }, () => service.redeem(user, reward.id, key)));
  assert.equal(new Set(orders.map(o => o.id)).size, 1);
  assert.equal((await service.detail(user, reward.id)).reward.stock, 2);
  const wallet = await ledger.wallet(user);
  assert.equal(wallet.balance, 100); assert.equal(wallet.reserved, 40); assert.equal(wallet.available, 60);
  const other = await account();
  await assert.rejects(service.redeem(other, reward.id, key), denied(409));
});
test("parallel different requests cannot overdraw balance", async () => {
  const { user, reward } = await fixture(5, 60);
  const results = await Promise.allSettled([service.redeem(user, reward.id, request()), service.redeem(user, reward.id, request())]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await ledger.wallet(user)).available, 20);
  assert.equal((await service.detail(user, reward.id)).reward.stock, 4);
});
test("parallel accounts cannot reserve the final stock twice", async () => {
  const { user, reward } = await fixture(1), other = await account();
  await ledger.execute({ kind: "adjust", actorId: admin, accountId: other, amount: 100, reason, idempotencyKey: randomUUID() });
  const results = await Promise.allSettled([service.redeem(user, reward.id, request()), service.redeem(other, reward.id, request())]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await service.detail(user, reward.id)).reward.stock, 0);
});
test("insufficient stock/balance rolls back request, points and audit; key retry succeeds later", async () => {
  const { user, reward } = await fixture(2, 0), key = request();
  await assert.rejects(service.redeem(user, reward.id, key), denied(409));
  assert.equal((await isolated.query("SELECT 1 FROM v2_reward_requests WHERE request_key=$1", [key.idempotencyKey])).rowCount, 0);
  assert.equal((await service.detail(user, reward.id)).reward.stock, 2);
  await ledger.execute({ kind: "adjust", actorId: admin, accountId: user, amount: 40, reason, idempotencyKey: randomUUID() });
  await service.redeem(user, reward.id, key);
  const empty = await fixture(0);
  await assert.rejects(service.redeem(empty.user, empty.reward.id, request()), denied(409));
});
test("risk blocks and supplier disablement fail closed without losing replay", async () => {
  const { user, reward } = await fixture(), key = request();
  await isolated.query("INSERT INTO v2_reward_risk_blocks VALUES($1,'Isolert risikovurdering')", [user]);
  await assert.rejects(service.redeem(user, reward.id, key), denied(403));
  await isolated.query("DELETE FROM v2_reward_risk_blocks WHERE account_id=$1", [user]);
  const order = await service.redeem(user, reward.id, key);
  await isolated.query("UPDATE v2_reward_suppliers SET active=false WHERE id='test-supplier'");
  await assert.rejects(service.redeem(user, reward.id, request()), denied(409));
  await assert.rejects(service.action(admin, order.id, action("dispatch")), denied(404));
  assert.equal((await service.redeem(user, reward.id, key)).id, order.id);
  await isolated.query("UPDATE v2_reward_suppliers SET active=true WHERE id='test-supplier'");
  await service.action(admin, order.id, action("refund"));
});
test("pre-delivery failure releases points/stock once, even on suspended owner and closed gate", async () => {
  const { user, reward } = await fixture(), o = await service.redeem(user, reward.id, request());
  await isolated.query("UPDATE v2_accounts SET status='SUSPENDED' WHERE id=$1", [user]);
  await isolated.query("UPDATE v2_redeem_gate SET enabled=false");
  const key = action("refund");
  const results = await Promise.all([service.action(admin, o.id, key), service.action(admin, o.id, key)]);
  assert.ok(results.every(r => r.status === "refunded"));
  assert.equal((await ledger.wallet(user)).balance, 100);
  assert.equal((await ledger.wallet(user)).reserved, 0);
  assert.equal((await service.list(admin, true)).items.find(r => r.id === reward.id).stock, 3);
  await assert.rejects(service.action(admin, o.id, action("refund")), denied(409));
  await isolated.query("UPDATE v2_redeem_gate SET enabled=true");
});
test("dispatch debits once; uncertain delivery retains debit/stock until evidenced refund", async () => {
  const { user, reward } = await fixture(), o = await service.redeem(user, reward.id, request()), dispatch = action("dispatch");
  await Promise.all([service.action(admin, o.id, dispatch), service.action(admin, o.id, dispatch)]);
  assert.equal((await ledger.wallet(user)).balance, 60);
  assert.equal((await ledger.wallet(user)).reserved, 0);
  await assert.rejects(service.action(admin, o.id, action("dispatch")), denied(409));
  await service.action(admin, o.id, action("uncertain"));
  assert.equal((await ledger.wallet(user)).balance, 60);
  await isolated.query("UPDATE v2_accounts SET status='SUSPENDED' WHERE id=$1", [user]);
  const refund = action("refund");
  await Promise.all([service.action(admin, o.id, refund), service.action(admin, o.id, refund)]);
  assert.equal((await ledger.wallet(user)).balance, 100);
  assert.equal((await service.list(admin, true)).items.find(r => r.id === reward.id).stock, 3);
  assert.equal((await isolated.query("SELECT count(*)::int n FROM v2_points_transactions WHERE related_transaction_id=$1", [o.transactionId])).rows[0].n, 1);
});
test("concurrent deliver/refund has one final outcome, delivery cannot be refunded again", async () => {
  const { user, reward } = await fixture(), o = await service.redeem(user, reward.id, request());
  await service.action(admin, o.id, action("dispatch"));
  const results = await Promise.allSettled([service.action(admin, o.id, action("delivered")), service.action(admin, o.id, action("refund"))]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const final = (await service.orders(user)).items[0];
  if (final.status === "delivered") assert.equal((await ledger.wallet(user)).balance, 60);
  else assert.equal((await ledger.wallet(user)).balance, 100);
});
test("foreign history/actions denied; changed-payload replay denied; generic ledger cannot bypass lifecycle", async () => {
  const { user, reward } = await fixture(), other = await account(), o = await service.redeem(user, reward.id, request());
  assert.ok(!(await service.orders(other)).items.some(r => r.id === o.id));
  await assert.rejects(service.action(other, o.id, action("refund")), denied(403));
  await assert.rejects(ledger.execute({ kind: "decide", actorId: admin, transactionId: o.transactionId,
    status: "approved", reason, idempotencyKey: randomUUID() }), denied(409));
  const a = action("dispatch");
  await service.action(admin, o.id, a);
  await assert.rejects(service.action(admin, o.id, { ...a, reason: `${reason} endret` }), denied(409));
  await assert.rejects(ledger.execute({ kind: "compensate", actorId: admin, transactionId: o.transactionId,
    type: "REFUND", reason, idempotencyKey: randomUUID() }), denied(409));
  await assert.rejects(ledger.execute({ kind: "compensate", actorId: admin, transactionId: o.transactionId,
    type: "REFUND", reason, idempotencyKey: `reward-hack:${randomUUID()}` }), denied(400));
});
test("reconciliation is read-only, private and detects corrupted stock/order settlement", async () => {
  assert.deepEqual(await service.reconcile(admin), { ok: true, issues: [] });
  const { user, reward } = await fixture(), o = await service.redeem(user, reward.id, request());
  await isolated.query("UPDATE v2_rewards SET stock_available=0 WHERE id=$1", [reward.id]);
  const report = await service.reconcile(admin);
  assert.ok(report.issues.some(r => r.code === "STOCK_MISMATCH" && r.reference === reward.id));
  assert.ok(!JSON.stringify(report).includes(user));
  await isolated.query("UPDATE v2_rewards SET stock_available=2 WHERE id=$1", [reward.id]);
  await isolated.query("UPDATE v2_reward_orders SET status='refunded' WHERE id=$1", [o.id]);
  assert.ok((await service.reconcile(admin)).issues.some(r => r.code === "ORDER_LEDGER_MISMATCH"));
  await isolated.query("UPDATE v2_reward_orders SET status='reserved' WHERE id=$1", [o.id]);
});
test("post-ledger write failure rolls back every order, reservation, stock, audit and request", async () => {
  const { user, reward } = await fixture(), key = request();
  await isolated.query(`CREATE FUNCTION test_fail_order() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'isolated failure after ledger write'; END; $$;
    CREATE TRIGGER test_order_failure BEFORE INSERT ON v2_reward_orders FOR EACH ROW EXECUTE FUNCTION test_fail_order()`);
  await assert.rejects(service.redeem(user, reward.id, key), /isolated failure/);
  assert.equal((await ledger.wallet(user)).available, 100);
  assert.equal((await ledger.wallet(user)).reserved, 0);
  assert.equal((await service.detail(user, reward.id)).reward.stock, 3);
  assert.equal((await service.orders(user)).items.length, 0);
  assert.equal((await isolated.query("SELECT 1 FROM v2_reward_requests WHERE request_key=$1", [key.idempotencyKey])).rowCount, 0);
  assert.equal((await isolated.query("SELECT 1 FROM v2_points_transactions WHERE account_id=$1 AND type='REDEEM'", [user])).rowCount, 0);
  await isolated.query("DROP TRIGGER test_order_failure ON v2_reward_orders; DROP FUNCTION test_fail_order()");
  const o = await service.redeem(user, reward.id, key);
  await assert.rejects(service.action(admin, o.id, { ...action("refund"), confirmedNotDelivered: false }), denied(400));
  await isolated.query(`CREATE FUNCTION test_fail_stock() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'isolated refund write failure'; END; $$;
    CREATE TRIGGER test_stock_failure BEFORE UPDATE ON v2_rewards FOR EACH ROW EXECUTE FUNCTION test_fail_stock()`);
  await assert.rejects(service.action(admin, o.id, action("refund")), /refund write failure/);
  assert.equal((await ledger.wallet(user)).reserved, 40);
  assert.equal((await service.orders(user)).items[0].status, "reserved");
  await isolated.query("DROP TRIGGER test_stock_failure ON v2_rewards; DROP FUNCTION test_fail_stock()");
  await service.action(admin, o.id, action("refund"));
  assert.equal((await ledger.wallet(user)).available, 100);
  assert.deepEqual(await service.reconcile(admin), { ok: true, issues: [] });
  assert.equal((await createPointsReconciler(isolated)()).status, "ok");
});
