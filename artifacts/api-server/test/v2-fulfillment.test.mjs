import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { applyV2Migrations, createTestBudget } from "./fixtures.mjs";

// Isolated PostgreSQL schema. Manual, secure gift-card delivery and redemption eligibility.
const out = new URL("../.cache/v2-fulfillment-test.mjs", import.meta.url);
await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
await build({
  stdin: { contents: `export * from "./src/v2/fulfillment"; export * from "./src/v2/rewards"; export * from "./src/v2/offers";
    export * from "./src/v2/points"; export * from "./src/v2/admin-requests"; export { pool } from "@workspace/db";`,
  resolveDir: new URL("../", import.meta.url).pathname, loader: "ts" },
  outfile: out.pathname, bundle: true, platform: "node", format: "esm", external: ["pg-native"],
  banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
});
const { pool, encryptVoucher, decryptVoucher, createRewardService, createOfferService, createPointsLedger, createAdminRequestService } = await import(out.href);
const schema = `fulfillment_test_${randomUUID().replaceAll("-", "")}`;
const isolated = new pool.constructor({ ...pool.options, options: `-c search_path=${schema}`, max: 8 });
const key = randomBytes(32);
const secret = "isolated-test-signing-key-not-a-live-credential";
const rewards = createRewardService(isolated, { voucherKey: key });
const offers = createOfferService(isolated, () => secret);
const ledger = createPointsLedger(isolated);
let now = Date.now();
const queue = createAdminRequestService(isolated, { clock: () => now, secretFor: () => secret });
const reason = "Kontrollert gavekortlevering i isolert test";
const denied = status => e => e.status === status;
let admin, second, budget;
async function account(role = "USER", ageDays = 30) {
  const id = `test_${randomUUID()}`;
  await isolated.query(`INSERT INTO v2_accounts(id,email,first_name,last_name,role,referral_code,
    terms_version,privacy_version,terms_accepted_at,privacy_accepted_at,email_verified_at,last_session_id,created_at)
    VALUES($1,$2,'Test','Gift',$3,$1,'test','test',now(),now(),now(),'test',now()-make_interval(days=>$4))`,
  [id, `${id}@example.invalid`, role, ageDays]);
  return id;
}
async function reward(faceValueNok = 100, stock = 10) {
  const r = await rewards.create(admin, { supplierId: "test-supplier", title: `Gavekort ${faceValueNok} kr`, description: "Kun isolert test av levering",
    terms: "Ingen virkelig leverandør.", faceValueNok, costOre: faceValueNok * 100, stock, supplierSku: "isolated", approvalReference: "Isolert godkjenning" });
  await rewards.review(admin, r.id, { status: "approved", reason });
  return r;
}
// Verified, conversion-funded earnings: the only earnings that unlock redemption.
async function verifiedEarnings(user, cpaOre = 4000) {
  const o = await offers.create(admin, { partnerId: "test-partner", title: "Testkampanje", description: "Kun isolert test av økonomien",
    terms: "Kun test. Ingen virkelig partner.", destinationUrl: "https://example.invalid/a", category: "other",
    requirements: "Kun syntetiske kontoer.", completionSteps: "Fullfør handlingen hos testpartneren.", estimatedMinutes: 5, approvalDays: 7,
    expiresAt: null, economics: { grossCpaOre: cpaOre, networkFeeBp: 0, expectedReversalBp: 0, giftcardFeeBp: 0, maxConversions: 10,
      paymentTermsDays: 30, agreementReference: "Isolert testavtale uten partner" } });
  await offers.reviewOffer(admin, o.id, { status: "approved", reason });
  const start = await offers.start(user, o.id, { idempotencyKey: randomUUID() });
  const raw = Buffer.from(JSON.stringify({ eventId: randomUUID(), clickId: start.clickId, status: "verified" }));
  const h = { timestamp: String(Math.floor(Date.now() / 1000)), nonce: randomUUID() };
  h.signature = createHmac("sha256", secret).update(`${h.timestamp}.${h.nonce}.`).update(raw).digest("hex");
  const c = await offers.callback("test-partner", raw, h);
  await offers.reviewConversion(user === second ? admin : second, c.id, { status: "verified", reason });
}
const fund = (user, amount) => ledger.execute({ kind: "adjust", accountId: user, amount, fundingBudgetId: budget, actorId: admin, reason, idempotencyKey: randomUUID() });
const act = (actor, orderId, action, extra = {}) => rewards.action(actor, orderId, { action, reason, evidenceReference: "Isolert leverandørreferanse",
  idempotencyKey: randomUUID(), ...extra });

before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  await applyV2Migrations(isolated);
  admin = await account("ADMIN"); second = await account("ADMIN");
  budget = await createTestBudget(isolated, admin);
  await isolated.query(`INSERT INTO v2_reward_suppliers(id,name,agreement_reference,integration_actor_id,active)
    VALUES('test-supplier','Isolert leverandør','Isolert avtaledokument',$1,true)`, [admin]);
  await isolated.query(`INSERT INTO v2_offer_partners(id,name,secret_env_key,integration_actor_id,active)
    VALUES('test-partner','Isolert testpartner','V2_OFFER_CALLBACK_TEST',$1,true)`, [admin]);
  await isolated.query(`UPDATE v2_earn_gate SET phase1_cleared=true,earn_enabled=true,clearance_reference='Isolated test clearance only'`);
  await isolated.query(`UPDATE v2_redeem_gate SET enabled=true,commercial_reference='Isolated commercial clearance'`);
});
after(async () => {
  await isolated.end();
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
});

test("vouchers are encrypted with AES-256-GCM and bound to their order", () => {
  const orderId = randomUUID();
  const sealed = encryptVoucher(key, orderId, { kind: "code", value: "GAVE-1234-ABCD" });
  assert.ok(!sealed.ciphertext.toString("utf8").includes("GAVE-1234"));
  assert.equal(decryptVoucher(key, orderId, { kind: "code", ...sealed }), "GAVE-1234-ABCD");
  assert.throws(() => decryptVoucher(key, randomUUID(), { kind: "code", ...sealed }));
  assert.throws(() => decryptVoucher(key, orderId, { kind: "link", ...sealed }));
  assert.throws(() => decryptVoucher(randomBytes(32), orderId, { kind: "code", ...sealed }));
  assert.throws(() => encryptVoucher(undefined, orderId, { kind: "code", value: "x" }), e => e.status === 503);
});

test("redemption requires account age, verified earnings and respects daily limits", async () => {
  const r = await reward(10);
  const young = await account("USER", 1);
  await fund(young, 5000);
  await assert.rejects(rewards.redeem(young, r.id, { idempotencyKey: randomUUID() }), e => e.status === 409 && /dager/.test(e.message));
  const unverified = await account();
  await fund(unverified, 5000);
  await assert.rejects(rewards.redeem(unverified, r.id, { idempotencyKey: randomUUID() }), e => e.status === 409 && /verifiserte tilbud/.test(e.message));
  const user = await account();
  await verifiedEarnings(user, 4000); // 1 200 BP at 30 %
  await fund(user, 5000);
  for (let i = 0; i < 3; i++) await rewards.redeem(user, r.id, { idempotencyKey: randomUUID() });
  await assert.rejects(rewards.redeem(user, r.id, { idempotencyKey: randomUUID() }), e => e.status === 409 && /grensen/.test(e.message));
});

test("delivery requires the supplier voucher, stores it encrypted and only the owner can see it", async () => {
  const r = await reward(50);
  const user = await account();
  await verifiedEarnings(user, 4000);
  await fund(user, 5000);
  const o = await rewards.redeem(user, r.id, { idempotencyKey: randomUUID() });
  await assert.rejects(rewards.voucher(user, o.id), denied(409));
  await act(admin, o.id, "dispatch");
  await assert.rejects(act(admin, o.id, "delivered"), denied(400));
  await assert.rejects(act(admin, o.id, "delivered", { voucher: { kind: "link", value: "http://insecure.example" } }), denied(400));
  await act(admin, o.id, "delivered", { voucher: { kind: "code", value: "GAVEKORT-9876-XYZ" } });
  const stored = (await isolated.query("SELECT * FROM v2_reward_deliveries WHERE order_id=$1", [o.id])).rows[0];
  assert.ok(!stored.ciphertext.toString("utf8").includes("9876"));
  const audits = (await isolated.query("SELECT metadata::text m FROM v2_audit_logs WHERE entity_id=$1", [o.id])).rows.map(a => a.m).join(" ");
  assert.ok(!audits.includes("9876"));
  const v = await rewards.voucher(user, o.id);
  assert.deepEqual([v.kind, v.value], ["code", "GAVEKORT-9876-XYZ"]);
  await assert.rejects(rewards.voucher(await account(), o.id), denied(404));
  await assert.rejects(rewards.voucher(admin, o.id), denied(404));
  const views = (await isolated.query("SELECT count(*)::int n FROM v2_audit_logs WHERE action='VOUCHER_VIEWED' AND entity_id=$1", [o.id])).rows[0].n;
  assert.equal(views, 1);
  await assert.rejects(isolated.query("UPDATE v2_reward_deliveries SET kind='link' WHERE order_id=$1", [o.id]), /append-only/);
});

test("the database refuses a delivered order without a voucher and non-manual suppliers", async () => {
  const r = await reward(20);
  const user = await account();
  await verifiedEarnings(user, 4000);
  await fund(user, 5000);
  const o = await rewards.redeem(user, r.id, { idempotencyKey: randomUUID() });
  await act(admin, o.id, "dispatch");
  await assert.rejects(isolated.query("UPDATE v2_reward_orders SET status='delivered' WHERE id=$1", [o.id]), e => e.code === "23514");
  await assert.rejects(isolated.query("UPDATE v2_reward_suppliers SET fulfillment_mode='api' WHERE id='test-supplier'"), e => e.code === "23514");
});

test("high-value orders are dispatched only via the approval queue, never for one's own order", async () => {
  const big = await reward(600, 5);
  const user = await account();
  await verifiedEarnings(user, 400000); // 120 000 BP
  const o = await rewards.redeem(user, big.id, { idempotencyKey: randomUUID() });
  await assert.rejects(act(admin, o.id, "dispatch"), e => e.status === 409 && e.body?.code === "USE_APPROVAL_QUEUE");
  now = Date.now();
  const req = await queue.request(admin, { action: "ORDER_DISPATCH", reason, requestKey: randomUUID(),
    payload: { orderId: o.id, evidenceReference: "Isolert leverandørreferanse" } });
  now = Date.now() + 61 * 60 * 1000;
  await queue.confirm(admin, req.id);
  assert.equal((await rewards.orders(user)).items.find(x => x.id === o.id).status, "delivering");
  // An administrator's own order can never be dispatched by themselves.
  await verifiedEarnings(second, 40000);
  const small = await reward(10);
  const own = await rewards.redeem(second, small.id, { idempotencyKey: randomUUID() });
  await assert.rejects(act(second, own.id, "dispatch"), denied(403));
  await assert.rejects(queue.request(second, { action: "ORDER_DISPATCH", reason, requestKey: randomUUID(),
    payload: { orderId: own.id, evidenceReference: "Isolert leverandørreferanse" } }), denied(403));
  await act(admin, own.id, "dispatch");
});
