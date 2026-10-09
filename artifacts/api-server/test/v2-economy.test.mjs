import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { applyV2Migrations, createTestBudget } from "./fixtures.mjs";

// Isolated PostgreSQL schema. Owner rules: 100 BP = 1 kr, 30 % default share, max 40 %,
// min 50 % margin, funded points only, profitability before activation, XP separate from points.
const out = new URL("../.cache/v2-economy-test.mjs", import.meta.url);
await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
await build({
  stdin: { contents: `export * from "./src/v2/economy"; export * from "./src/v2/offers"; export * from "./src/v2/points";
    export * from "./src/v2/rewards"; export * from "./src/v2/engagement"; export * from "./src/v2/admin-requests"; export { pool } from "@workspace/db";`,
  resolveDir: new URL("../", import.meta.url).pathname, loader: "ts" },
  outfile: out.pathname, bundle: true, platform: "node", format: "esm", external: ["pg-native"],
  banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
});
const m = await import(out.href);
const { pool, campaignEconomics, createOfferService, createPointsLedger, createRewardService, createEngagementService,
  createAdminRequestService, levelFor, levelFloor, streakFrom, longestStreak } = m;
const schema = `economy_test_${randomUUID().replaceAll("-", "")}`;
const isolated = new pool.constructor({ ...pool.options, options: `-c search_path=${schema}`, max: 8 });
const secret = "isolated-test-signing-key-not-a-live-credential";
const offers = createOfferService(isolated, () => secret);
const ledger = createPointsLedger(isolated);
const rewards = createRewardService(isolated);
const engagement = createEngagementService(isolated);
let now = Date.now();
const queue = createAdminRequestService(isolated, { clock: () => now, secretFor: () => secret });
const reason = "Kontrollert økonomitest i isolert skjema";
const denied = status => e => e.status === status;
const config = { version: 1, defaultShareBp: 3000, maxShareBp: 4000, minMarginBp: 5000 };
let admin, budget;
async function account(role = "USER") {
  const id = `test_${randomUUID()}`;
  await isolated.query(`INSERT INTO v2_accounts(id,email,first_name,last_name,role,referral_code,
    terms_version,privacy_version,terms_accepted_at,privacy_accepted_at,email_verified_at,last_session_id)
    VALUES($1,$2,'Test','Economy',$3,$1,'test','test',now(),now(),now(),'test')`, [id, `${id}@example.invalid`, role]);
  return id;
}
const econ = (x = {}) => ({ grossCpaOre: 20000, networkFeeBp: 1500, expectedReversalBp: 800, giftcardFeeBp: 200,
  maxConversions: 100, paymentTermsDays: 30, agreementReference: "Isolert testavtale uten virkelig partner", ...x });
const offerInput = (x = {}) => ({ partnerId: "test-partner", title: "Syntetisk kampanje", description: "Kun isolert test av økonomien",
  terms: "Kun test. Ingen penger eller virkelig partner.", destinationUrl: "https://example.invalid/action",
  category: "other", requirements: "Kun for syntetiske testkontoer.", completionSteps: "Fullfør handlingen hos testpartneren.",
  estimatedMinutes: 5, approvalDays: 7, expiresAt: null, economics: econ(x) });
async function approvedOffer(x = {}) {
  const o = await offers.create(admin, offerInput(x));
  await offers.reviewOffer(admin, o.id, { status: "approved", reason });
  return o;
}
function signed(body) {
  const raw = Buffer.from(JSON.stringify(body));
  const headers = { timestamp: String(Math.floor(Date.now() / 1000)), nonce: randomUUID() };
  headers.signature = createHmac("sha256", secret).update(`${headers.timestamp}.${headers.nonce}.`).update(raw).digest("hex");
  return { raw, headers };
}
async function convert(offerId, user = null) {
  const u = user ?? await account();
  const start = await offers.start(u, offerId, { idempotencyKey: randomUUID() });
  const r = signed({ eventId: randomUUID(), clickId: start.clickId, status: "verified" });
  return { user: u, conversion: await offers.callback("test-partner", r.raw, r.headers) };
}

before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  await applyV2Migrations(isolated);
  admin = await account("ADMIN");
  budget = await createTestBudget(isolated, admin, 1000);
  await isolated.query(`INSERT INTO v2_offer_partners(id,name,secret_env_key,integration_actor_id,active)
    VALUES('test-partner','Isolert testpartner','V2_OFFER_CALLBACK_TEST',$1,true)`, [admin]);
  await isolated.query(`UPDATE v2_earn_gate SET phase1_cleared=true,earn_enabled=true,clearance_reference='Isolated test clearance only'`);
  await isolated.query(`INSERT INTO v2_reward_suppliers(id,name,agreement_reference,integration_actor_id,active)
    VALUES('test-supplier','Isolert leverandør','Isolert avtaledokument',$1,true)`, [admin]);
});
after(async () => {
  await isolated.end();
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
});

test("profitability: 200 kr CPA, 15 % network fee, 30 % share gives 5 100 BP and a margin above 50 %", () => {
  const e = campaignEconomics(econ(), config);
  assert.equal(e.netOre, 17000);
  assert.equal(e.points, 5100);
  assert.equal(e.userShareBp, 3000);
  assert.ok(e.expectedMarginBp >= 5000);
  assert.equal(e.ok, true);
  assert.equal(e.maxLiabilityOre, 510000);
  const tooHigh = campaignEconomics(econ({ userShareBp: 4100 }), { ...config, maxShareBp: 4000 });
  assert.equal(tooHigh.ok, false);
  const thin = campaignEconomics(econ({ userShareBp: 4000, expectedReversalBp: 2000 }), config);
  assert.equal(thin.ok, false);
  assert.match(thin.problems.join(" "), /margin/);
});

test("campaign points are computed by the server and stored with an immutable profitability snapshot", async () => {
  const o = await offers.create(admin, offerInput());
  assert.equal(o.points, 5100);
  const row = (await isolated.query("SELECT * FROM v2_offer_economics WHERE offer_id=$1", [o.id])).rows[0];
  assert.equal(row.points, 5100);
  assert.equal(row.user_share_bp, 3000);
  await assert.rejects(isolated.query("UPDATE v2_offer_economics SET user_share_bp=4000 WHERE offer_id=$1", [o.id]), /append-only/);
  await assert.rejects(offers.create(admin, { ...offerInput(), points: 999999 }), denied(400));
  await assert.rejects(offers.create(admin, offerInput({ userShareBp: 4000, expectedReversalBp: 3000 })), denied(400));
  await assert.rejects(offers.create(admin, offerInput({ userShareBp: 4500 })), denied(400));
  const { economics, ...noEconomics } = offerInput();
  await assert.rejects(offers.create(admin, noEconomics), denied(400));
  // The database recomputes the arithmetic: a forged snapshot is rejected.
  const id = randomUUID();
  await isolated.query(`INSERT INTO v2_offers(id,partner_id,title,description,terms,points,destination_url,created_by,category,
    requirements,completion_steps,estimated_minutes,approval_days) VALUES($1,'test-partner','Forfalsket','Kun isolert test',
    'Kun isolert test',9999,'https://example.invalid',$2,'other','Kun isolert test','Kun isolert test',5,7)`, [id, admin]);
  await assert.rejects(isolated.query(`INSERT INTO v2_offer_economics(offer_id,config_version,gross_cpa_ore,network_fee_bp,
    expected_reversal_bp,giftcard_fee_bp,user_share_bp,net_ore,points,expected_margin_bp,max_conversions,payment_terms_days,agreement_reference)
    VALUES($1,1,20000,1500,800,200,3000,17000,9999,5000,10,30,'Forfalsket referanse')`, [id]), e => e.code === "23514");
  await assert.rejects(isolated.query("UPDATE v2_offers SET status='approved' WHERE id=$1", [id]), /economics are required/);
});

test("activation re-checks profitability against the rules in force", async () => {
  const o = await offers.create(admin, offerInput({ userShareBp: 4000 }));
  now = Date.now();
  const r = await queue.request(admin, { action: "ECONOMY_CONFIG", reason, requestKey: randomUUID(), payload: {
    defaultShareBp: 3000, maxShareBp: 3500, minMarginBp: 5000, highRiskCooldownMinutes: 60, highValueOrderPoints: 50000,
    dualControl: false, minAccountAgeDays: 7, minVerifiedPointsBeforeRedeem: 1000, maxRedemptionsPerDay: 3, maxRedeemPointsPerDay: 100000 } });
  now = Date.now() + 61 * 60 * 1000;
  await queue.confirm(admin, r.id);
  await assert.rejects(offers.reviewOffer(admin, o.id, { status: "approved", reason }), denied(409));
  const ok = await offers.create(admin, offerInput());
  await offers.reviewOffer(admin, ok.id, { status: "approved", reason });
});

test("conversions are funded by the conversion, capped by the campaign and grant XP but no extra points", async () => {
  const o = await approvedOffer({ maxConversions: 2 });
  const a = await convert(o.id);
  const t = (await isolated.query("SELECT funding_kind,funding_reference,amount FROM v2_points_transactions WHERE id=$1", [a.conversion.transactionId])).rows[0];
  assert.deepEqual([t.funding_kind, t.funding_reference, t.amount], ["conversion", a.conversion.id, 5100]);
  await convert(o.id);
  await assert.rejects(convert(o.id), denied(409));
  // A rejected conversion frees a slot.
  await offers.reviewConversion(admin, a.conversion.id, { status: "rejected", reason });
  await convert(o.id);
  const b = await convert((await approvedOffer()).id);
  await offers.reviewConversion(admin, b.conversion.id, { status: "verified", reason });
  assert.equal((await ledger.wallet(b.user)).available, 5100);
  const xp = await engagement.get(b.user);
  assert.equal(xp.xp, 100);
  assert.ok(xp.badges.find(x => x.id === "first-offer").earned);
});

test("points without funding are rejected by the engine and by the database", async () => {
  const user = await account();
  for (const type of ["EARN", "REFERRAL", "BONUS"]) {
    await assert.rejects(ledger.execute({ kind: "record", accountId: user, type, amount: 10, status: "approved", actorId: admin, reason,
      source: "verified-test", reference: randomUUID(), description: "Uten finansiering", idempotencyKey: randomUUID() }), denied(400));
  }
  await assert.rejects(ledger.execute({ kind: "adjust", accountId: user, amount: 10, actorId: admin, reason, idempotencyKey: randomUUID() }), denied(400));
  await assert.rejects(ledger.execute({ kind: "record", accountId: user, type: "EARN", amount: 10, status: "approved", actorId: admin, reason,
    source: "verified-test", reference: randomUUID(), description: "Falsk konvertering", funding: { kind: "conversion", reference: randomUUID() },
    idempotencyKey: randomUUID() }), denied(400));
  await assert.rejects(isolated.query(`INSERT INTO v2_points_transactions(id,account_id,type,amount,source,reference,description,reason,actor_id)
    VALUES($1,$2,'BONUS',10,'sql','sql-ref','Direkte SQL',$3,$4)`, [randomUUID(), user, reason, admin]), e => e.code === "23514");
  await assert.rejects(isolated.query(`INSERT INTO v2_points_transactions(id,account_id,type,amount,source,reference,description,reason,actor_id)
    VALUES($1,$2,'ADJUSTMENT',10,'sql','sql-ref-2','Direkte SQL',$3,$4)`, [randomUUID(), user, reason, admin]), e => e.code === "23514");
  // Negative adjustments need no funding.
  await ledger.execute({ kind: "adjust", accountId: user, amount: 5, fundingBudgetId: budget, actorId: admin, reason, idempotencyKey: randomUUID() });
  await ledger.execute({ kind: "adjust", accountId: user, amount: -5, actorId: admin, reason, idempotencyKey: randomUUID() });
});

test("marketing budgets cap credits, expire and are created only through the approval queue", async () => {
  const small = await createTestBudget(isolated, admin, 100);
  const user = await account();
  await ledger.execute({ kind: "adjust", accountId: user, amount: 60, fundingBudgetId: small, actorId: admin, reason, idempotencyKey: randomUUID() });
  await assert.rejects(ledger.execute({ kind: "adjust", accountId: user, amount: 41, fundingBudgetId: small, actorId: admin, reason,
    idempotencyKey: randomUUID() }), denied(409));
  await assert.rejects(isolated.query(`INSERT INTO v2_points_transactions(id,account_id,type,amount,source,reference,description,reason,actor_id,funding_kind,funding_reference)
    VALUES($1,$2,'BONUS',41,'sql','sql-ref-3','Direkte SQL',$3,$4,'budget',$5)`, [randomUUID(), user, reason, admin, small]), e => e.code === "23514");
  await ledger.execute({ kind: "adjust", accountId: user, amount: 40, fundingBudgetId: small, actorId: admin, reason, idempotencyKey: randomUUID() });
  await assert.rejects(ledger.execute({ kind: "adjust", accountId: user, amount: 10, fundingBudgetId: randomUUID(), actorId: admin, reason,
    idempotencyKey: randomUUID() }), denied(409));
  // Budget via queue.
  now = Date.now();
  await assert.rejects(queue.request(admin, { action: "MARKETING_BUDGET", reason, requestKey: randomUUID(),
    payload: { name: "Lansering", purpose: "Velkomstbonus til testere", pointsTotal: 5000, validUntil: new Date(Date.now() - 1000).toISOString() } }), denied(400));
  const r = await queue.request(admin, { action: "MARKETING_BUDGET", reason, requestKey: randomUUID(),
    payload: { name: "Lansering", purpose: "Velkomstbonus til testere", pointsTotal: 5000, validUntil: new Date(Date.now() + 30 * 86400000).toISOString() } });
  now = Date.now() + 61 * 60 * 1000;
  const done = await queue.confirm(admin, r.id);
  const id = done.result.budgetId;
  assert.equal((await isolated.query("SELECT points_total FROM v2_marketing_budgets WHERE id=$1", [id])).rows[0].points_total, 5000);
  await assert.rejects(isolated.query("UPDATE v2_marketing_budgets SET points_total=999999 WHERE id=$1", [id]), /append-only/);
  // A positive adjustment request without a budget is refused up front.
  await assert.rejects(queue.request(admin, { action: "POINTS_ADJUSTMENT", reason, requestKey: randomUUID(), payload: { accountId: user, amount: 10 } }), denied(400));
});

test("gift cards are priced at face value: 100 BP per krone", async () => {
  const r = await rewards.create(admin, { supplierId: "test-supplier", title: "Gavekort 100 kr", description: "Kun isolert test av prising",
    terms: "Ingen virkelig leverandør.", faceValueNok: 100, costOre: 10000, stock: 2, supplierSku: "isolated", approvalReference: "Isolert godkjenning" });
  assert.equal(r.points, 10000);
  assert.equal(r.faceValueOre, 10000);
  await assert.rejects(rewards.create(admin, { supplierId: "test-supplier", title: "Gavekort", description: "Kun isolert test av prising",
    terms: "Ingen virkelig leverandør.", points: 1, faceValueNok: 100, costOre: 10000, stock: 2, supplierSku: "isolated",
    approvalReference: "Isolert godkjenning" }), denied(400));
  await assert.rejects(isolated.query(`INSERT INTO v2_rewards(id,supplier_id,supplier_sku,approval_reference,title,description,terms,points,
    stock_total,stock_available,created_by,face_value_ore,cost_ore) VALUES($1,'test-supplier','x','Isolert godkjenning','x','x','x',5000,1,1,$2,10000,9000)`,
  [randomUUID(), admin]), e => e.code === "23514");
});

test("XP, levels, streaks and badges never create BonusPoints", async () => {
  assert.equal(levelFor(0), 1); assert.equal(levelFor(99), 1); assert.equal(levelFor(100), 2); assert.equal(levelFor(1000), 5);
  assert.equal(levelFloor(10), 4500);
  assert.equal(streakFrom(["2026-10-07", "2026-10-08", "2026-10-09"], "2026-10-09"), 3);
  assert.equal(streakFrom(["2026-10-07", "2026-10-08"], "2026-10-09"), 2);
  assert.equal(streakFrom(["2026-10-06"], "2026-10-09"), 0);
  assert.equal(longestStreak(["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05", "2026-10-06"]), 3);
  const user = await account();
  const first = await engagement.checkIn(user);
  assert.equal(first.xpAwarded, 10);
  assert.equal(first.checkedInToday, true);
  assert.equal(first.streak, 1);
  const again = await Promise.all([engagement.checkIn(user), engagement.checkIn(user)]);
  assert.deepEqual(again.map(x => x.xpAwarded), [0, 0]);
  assert.equal((await engagement.get(user)).xp, 10);
  assert.equal((await isolated.query("SELECT count(*)::int n FROM v2_points_transactions WHERE account_id=$1", [user])).rows[0].n, 0);
  assert.deepEqual(await ledger.wallet(user), { accountId: user, balance: 0, reserved: 0, available: 0, pending: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });
  // Yesterday's check-in extends the streak and gives a capped XP bonus.
  await isolated.query(`INSERT INTO v2_xp_events(account_id,kind,xp,reference,oslo_day)
    SELECT $1,'DAILY_CHECKIN',10,d::text,d FROM generate_series((now() AT TIME ZONE 'Europe/Oslo')::date - 7,(now() AT TIME ZONE 'Europe/Oslo')::date - 1,'1 day') d`, [await account().then(async id => { globalThis.streaker = id; return id; })]);
  const s = await engagement.checkIn(globalThis.streaker);
  assert.equal(s.streak, 8);
  assert.equal(s.xpAwarded, 10 + 30);
  assert.ok(s.badges.find(b => b.id === "streak-7").earned);
  await assert.rejects(isolated.query("DELETE FROM v2_xp_events WHERE account_id=$1", [user]), /append-only/);
});
