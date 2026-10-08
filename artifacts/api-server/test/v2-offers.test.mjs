import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

const out = new URL("../.cache/v2-offers-test.mjs", import.meta.url);
await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
await build({
  stdin: { contents: 'export * from "./src/v2/offers"; export * from "./src/v2/points"; export { pool } from "@workspace/db";',
    resolveDir: new URL("../", import.meta.url).pathname, loader: "ts" },
  outfile: out.pathname, bundle: true, platform: "node", format: "esm", external: ["pg-native"],
  banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
});
const { createOfferService, createPointsLedger, pool } = await import(out.href);
const schema = `offers_test_${randomUUID().replaceAll("-", "")}`;
const isolated = new pool.constructor({ ...pool.options, options: `-c search_path=${schema}`, max: 12 });
// Synthetic secret exclusively in this isolated test process, not a credential.
const secret = "isolated-test-signing-key-not-a-live-credential";
const offers = createOfferService(isolated, () => secret);
const ledger = createPointsLedger(isolated);
let admin;
const reason = "Kontrollert vurdering av signert partnerbevis";
const denied = status => error => error.status === status;
async function account(role = "USER") {
  const id = `test_${randomUUID()}`;
  await isolated.query(`INSERT INTO v2_accounts(id,email,first_name,last_name,role,referral_code,
    terms_version,privacy_version,terms_accepted_at,privacy_accepted_at,email_verified_at,last_session_id)
    VALUES($1,$2,'Test','Offers',$3,$1,'test','test',now(),now(),now(),'test')`, [id, `${id}@example.invalid`, role]);
  return id;
}
const input = () => ({ partnerId: "test-partner", title: "Syntetisk testtilbud", description: "Kun isolert test av tilbudsmotor",
  terms: "Kun test. Ingen penger eller virkelig partner.", points: 37, destinationUrl: "https://example.invalid/action?campaign=test",
  category: "other", requirements: "Kun for syntetiske testkontoer.", completionSteps: "Fullfør handlingen hos testpartneren.",
  estimatedMinutes: 5, approvalDays: 7, expiresAt: null });
async function fixture(partnerId = "test-partner") {
  const user = await account();
  const offer = await offers.create(admin, { ...input(), partnerId });
  await offers.reviewOffer(admin, offer.id, { status: "approved", reason });
  const start = await offers.start(user, offer.id, { idempotencyKey: randomUUID() });
  return { user, offer, start };
}
function signed(body, extra = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const headers = { timestamp: String(Math.floor(Date.now() / 1000)), nonce: randomUUID(), ...extra };
  headers.signature = createHmac("sha256", secret).update(`${headers.timestamp}.${headers.nonce}.`).update(raw).digest("hex");
  return { raw, headers };
}
async function send(f, status = "verified", eventId = randomUUID(), partnerId = "test-partner") {
  const request = signed({ eventId, clickId: f.start.clickId, status });
  return offers.callback(partnerId, request.raw, request.headers);
}
async function review(id, status = "verified", actor = admin) {
  return offers.reviewConversion(actor, id, { status, reason });
}
before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  for (const name of ["0001_v2_identity.sql", "0002_v2_points.sql", "0003_v2_offers.sql", "0004_v2_offer_reversals.sql"]) {
    await isolated.query(await readFile(new URL(`../../../lib/db/migrations/${name}`, import.meta.url), "utf8"));
  }
  admin = await account("ADMIN");
  for (const partner of ["test-partner", "other-partner"]) {
    await isolated.query(`INSERT INTO v2_offer_partners(id,name,secret_env_key,integration_actor_id,active)
      VALUES($1,'Isolert testpartner','V2_OFFER_CALLBACK_TEST',$2,true)`, [partner, admin]);
  }
});
after(async () => {
  await isolated.end();
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
});

test("rollout defaults closed and browser cannot start; clearance is required by SQL", async () => {
  const user = await account(), offer = await offers.create(admin, input());
  await offers.reviewOffer(admin, offer.id, { status: "approved", reason });
  assert.equal((await offers.listOffers(user)).earnEnabled, false);
  await assert.rejects(offers.start(user, offer.id, { idempotencyKey: randomUUID() }), denied(503));
  await assert.rejects(isolated.query("UPDATE v2_earn_gate SET earn_enabled=true"), e => e.code === "23514");
  await isolated.query(`UPDATE v2_earn_gate SET phase1_cleared=true,earn_enabled=true,
    clearance_reference='Isolated test clearance only'`);
});

test("only reviewed offers are visible/startable; rejecting approved offer pauses it", async () => {
  const user = await account(), draft = await offers.create(admin, input());
  assert.ok(!(await offers.listOffers(user)).items.some(o => o.id === draft.id));
  await assert.rejects(offers.detail(user, draft.id), denied(404));
  await assert.rejects(offers.start(user, draft.id, { idempotencyKey: randomUUID() }), denied(404));
  await offers.reviewOffer(admin, draft.id, { status: "approved", reason });
  assert.equal((await offers.detail(user, draft.id)).offer.points, 37);
  await offers.reviewOffer(admin, draft.id, { status: "rejected", reason });
  await assert.rejects(offers.detail(user, draft.id), denied(404));
  await assert.rejects(offers.reviewOffer(admin, draft.id, { status: "approved", reason }), denied(409));
});

test("start is idempotent, server attributes click and amount; click alone never credits", async () => {
  const f = await fixture(), key = randomUUID();
  const [a, b] = await Promise.all([offers.start(f.user, f.offer.id, { idempotencyKey: key }),
    offers.start(f.user, f.offer.id, { idempotencyKey: key })]);
  assert.deepEqual(a, b);
  assert.equal(new URL(a.redirectUrl).searchParams.get("bp_click"), a.clickId);
  assert.equal(new URL(a.redirectUrl).searchParams.get("campaign"), "test");
  assert.equal((await ledger.wallet(f.user)).balance, 0);
  await assert.rejects(offers.start(await account(), f.offer.id, { idempotencyKey: key }), denied(409));
  await assert.rejects(offers.start(f.user, f.offer.id, { idempotencyKey: randomUUID(), amount: 999999 }), denied(400));
});

test("signature verifies raw bytes, rejects tampering, bad/missing headers and stale/future timestamps", async () => {
  const f = await fixture(), req = signed({ clickId: f.start.clickId, eventId: randomUUID(), status: "verified" });
  await assert.rejects(offers.callback("test-partner", Buffer.concat([req.raw, Buffer.from(" ")]), req.headers), denied(401));
  for (const headers of [
    { ...req.headers, signature: "0".repeat(64) }, { ...req.headers, signature: "bad" }, { ...req.headers, nonce: "bad" },
    { ...req.headers, timestamp: undefined }, { ...req.headers, signature: undefined },
  ]) await assert.rejects(offers.callback("test-partner", req.raw, headers), denied(401));
  for (const delta of [-301, 301]) {
    const old = signed({ clickId: f.start.clickId, eventId: randomUUID(), status: "verified" },
      { timestamp: String(Math.floor(Date.now() / 1000) + delta) });
    await assert.rejects(offers.callback("test-partner", old.raw, old.headers), denied(401));
  }
  assert.equal((await ledger.wallet(f.user)).pending, 0);
});

test("nonce replay rejected, fresh-nonce event duplicate returns same conversion without reward duplication", async () => {
  const f = await fixture(), eventId = randomUUID(), req = signed({ clickId: f.start.clickId, eventId, status: "verified" });
  const v = await offers.callback("test-partner", req.raw, req.headers);
  await assert.rejects(offers.callback("test-partner", req.raw, req.headers), denied(409));
  const again = await send(f, "verified", eventId);
  assert.equal(again.id, v.id);
  assert.equal((await ledger.wallet(f.user)).balance, 0);
  assert.equal((await ledger.wallet(f.user)).pending, 37);
  assert.equal((await ledger.history(f.user)).items.length, 1);
});

test("verified evidence awaits separate admin review; duplicate review awards once", async () => {
  const f = await fixture(), v = await send(f);
  assert.equal(v.partnerStatus, "verified");
  assert.equal(v.status, "pending");
  const decision = await review(v.id);
  assert.equal(decision.status, "verified");
  await review(v.id);
  assert.equal((await ledger.wallet(f.user)).balance, 37);
  assert.equal((await ledger.wallet(f.user)).pending, 0);
  const history = (await ledger.history(f.user)).items;
  assert.equal(history.length, 1);
  assert.equal(history[0].source, "offer:test-partner");
  assert.equal(history[0].events.length, 2);
});

test("pending partner lifecycle cannot approve; verified evidence then allows review", async () => {
  const f = await fixture(), event = randomUUID(), v = await send(f, "pending", event);
  await assert.rejects(review(v.id), denied(409));
  await send(f, "verified", event);
  await review(v.id);
  assert.equal((await ledger.wallet(f.user)).balance, 37);
});

test("partner rejection rejects pending ledger; no positive balance", async () => {
  const f = await fixture(), event = randomUUID(), v = await send(f, "pending", event);
  assert.equal((await send(f, "rejected", event)).status, "rejected");
  assert.equal((await ledger.wallet(f.user)).balance, 0);
  assert.equal((await ledger.wallet(f.user)).pending, 0);
  assert.equal((await ledger.history(f.user)).items[0].status, "rejected");
  await assert.rejects(review(v.id), denied(409));
  await assert.rejects(send(f, "verified", event), denied(409));
  const fresh = await fixture();
  assert.equal((await send(fresh, "rejected")).status, "rejected");
  assert.equal((await ledger.wallet(fresh.user)).pending, 0);
});

test("manual rejection cannot be revived by a later verified callback", async () => {
  const f = await fixture(), event = randomUUID(), v = await send(f, "pending", event);
  await review(v.id, "rejected");
  const after = await send(f, "verified", event);
  assert.equal(after.status, "rejected");
  await assert.rejects(review(v.id), denied(409));
  assert.equal((await ledger.wallet(f.user)).balance, 0);
});

test("one conversion per click and partner event; conflicting ownership never changes ledger", async () => {
  const f = await fixture(), other = await fixture(), event = randomUUID();
  await send(f, "verified", event);
  await assert.rejects(send(f, "verified", randomUUID()), denied(409));
  await assert.rejects(send(other, "verified", event), denied(409));
  assert.equal((await ledger.wallet(f.user)).pending, 37);
  assert.equal((await ledger.wallet(other.user)).pending, 0);
});

test("partner callback is scoped to partner, cannot claim another partner click or browser amount/account", async () => {
  const f = await fixture();
  await assert.rejects(send(f, "verified", randomUUID(), "other-partner"), denied(404));
  await assert.rejects(send(f, "verified", randomUUID(), "unknown-partner"), denied(401));
  for (const extra of [{ amount: 9000 }, { accountId: await account() }, { points: 9000 }]) {
    const req = signed({ clickId: f.start.clickId, eventId: randomUUID(), status: "verified", ...extra });
    await assert.rejects(offers.callback("test-partner", req.raw, req.headers), denied(400));
  }
  assert.equal((await ledger.wallet(f.user)).pending, 0);
});

test("RBAC denies normal and PARTNER accounts administrator methods; conversions owner scoped", async () => {
  const f = await fixture(), outsider = await account(), partner = await account("PARTNER");
  const v = await send(f);
  assert.equal((await offers.listConversions(f.user)).items[0].id, v.id);
  assert.equal((await offers.listConversions(outsider)).items.length, 0);
  for (const actor of [outsider, partner]) {
    await assert.rejects(offers.listOffers(actor, true), denied(403));
    await assert.rejects(offers.listConversions(actor, true), denied(403));
    await assert.rejects(offers.partners(actor), denied(403));
    await assert.rejects(offers.create(actor, input()), denied(403));
    await assert.rejects(offers.reviewOffer(actor, f.offer.id, { status: "rejected", reason }), denied(403));
    await assert.rejects(review(v.id, "verified", actor), denied(403));
  }
});

test("inactive accounts cannot start, receive pending awards or review approvals", async () => {
  const f = await fixture();
  await isolated.query("UPDATE v2_accounts SET status='SUSPENDED' WHERE id=$1", [f.user]);
  await assert.rejects(offers.start(f.user, f.offer.id, { idempotencyKey: randomUUID() }), denied(403));
  await assert.rejects(send(f), denied(403));
  assert.equal((await ledger.wallet(f.user)).pending, 0);
});

test("trusted integration actor must remain an active stored administrator", async () => {
  const f = await fixture(), userActor = await account();
  await isolated.query("UPDATE v2_offer_partners SET integration_actor_id=$1 WHERE id='test-partner'", [userActor]);
  await assert.rejects(send(f), denied(403));
  await isolated.query("UPDATE v2_offer_partners SET integration_actor_id=$1 WHERE id='test-partner'", [admin]);
  const missingSecret = createOfferService(isolated, () => undefined), req = signed({ clickId: f.start.clickId, eventId: randomUUID(), status: "verified" });
  await assert.rejects(missingSecret.callback("test-partner", req.raw, req.headers), denied(503));
  const inactiveActor = await account("ADMIN");
  await isolated.query("UPDATE v2_accounts SET status='SUSPENDED' WHERE id=$1", [inactiveActor]);
  await isolated.query("UPDATE v2_offer_partners SET integration_actor_id=$1 WHERE id='test-partner'", [inactiveActor]);
  await assert.rejects(send(f), denied(403));
  await isolated.query("UPDATE v2_offer_partners SET integration_actor_id=$1 WHERE id='test-partner'", [admin]);
});

test("direct points approval and compensation cannot bypass offer conversion review", async () => {
  const f = await fixture(), v = await send(f);
  await assert.rejects(ledger.execute({ kind: "decide", transactionId: v.transactionId, actorId: admin,
    status: "approved", reason, idempotencyKey: randomUUID() }), denied(409));
  await review(v.id);
  await assert.rejects(ledger.execute({ kind: "compensate", transactionId: v.transactionId, actorId: admin,
    type: "REVERSAL", reason, idempotencyKey: randomUUID() }), denied(409));
});

test("concurrent identical callbacks and racing approval/rejection have one durable outcome", async () => {
  const f = await fixture(), event = randomUUID();
  const duplicates = await Promise.all([send(f, "verified", event), send(f, "verified", event)]);
  assert.equal(duplicates[0].id, duplicates[1].id);
  const results = await Promise.allSettled([review(duplicates[0].id), review(duplicates[0].id, "rejected")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
  const wallet = await ledger.wallet(f.user);
  assert.ok([0, 37].includes(wallet.balance));
  assert.equal(wallet.pending, 0);
  assert.equal((await ledger.history(f.user)).items[0].events.length, 2);
});

test("outer rollback removes pending ledger, receipt and conversion together", async () => {
  const f = await fixture(), req = signed({ clickId: f.start.clickId, eventId: randomUUID(), status: "verified" });
  await isolated.query(`CREATE FUNCTION fail_offer_conversion_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Synthetic failure after ledger write'; END; $$;
    CREATE TRIGGER fail_offer_conversion BEFORE INSERT ON v2_offer_conversions FOR EACH ROW EXECUTE FUNCTION fail_offer_conversion_test()`);
  try {
    await assert.rejects(offers.callback("test-partner", req.raw, req.headers), /Synthetic failure/);
  } finally {
    await isolated.query("DROP TRIGGER fail_offer_conversion ON v2_offer_conversions; DROP FUNCTION fail_offer_conversion_test()");
  }
  assert.equal((await ledger.history(f.user)).items.length, 0);
  assert.equal((await isolated.query("SELECT 1 FROM v2_offer_callback_receipts WHERE nonce=$1", [req.headers.nonce])).rowCount, 0);
  assert.equal((await offers.callback("test-partner", req.raw, req.headers)).status, "pending");
});

test("closing rollout blocks callbacks and approvals without changing pending funds", async () => {
  const f = await fixture(), v = await send(f);
  await isolated.query("UPDATE v2_earn_gate SET earn_enabled=false");
  try {
    await assert.rejects(send(f), denied(503));
    await assert.rejects(review(v.id), denied(503));
    assert.equal((await ledger.wallet(f.user)).balance, 0);
    assert.equal((await ledger.wallet(f.user)).pending, 37);
  } finally {
    await isolated.query("UPDATE v2_earn_gate SET earn_enabled=true");
  }
});

test("server economics are immutable; withdrawn offer cannot be used to approve evidence", async () => {
  const f = await fixture(), v = await send(f);
  await assert.rejects(isolated.query("UPDATE v2_offers SET points=999 WHERE id=$1", [f.offer.id]), /immutable/);
  await offers.reviewOffer(admin, f.offer.id, { status: "rejected", reason });
  await assert.rejects(review(v.id), denied(409));
  await review(v.id, "rejected");
  assert.equal((await ledger.wallet(f.user)).balance, 0);
  await assert.rejects(isolated.query("DELETE FROM v2_offer_clicks WHERE id=$1", [f.start.clickId]), /append-only/);
  await assert.rejects(isolated.query("DELETE FROM v2_offer_conversions WHERE id=$1", [v.id]), /append-only/);
});

test("HTTPS destination validation, reasons and explicit configured partner required", async () => {
  for (const destinationUrl of ["http://example.invalid", "https://user:pass@example.invalid", "https://example.invalid/#secret",
    "https://example.invalid/?bp_click=browser", "not-url"]) {
    await assert.rejects(offers.create(admin, { ...input(), destinationUrl }), denied(400));
  }
  await assert.rejects(offers.create(admin, { ...input(), partnerId: "not-configured" }), denied(400));
  await assert.rejects(offers.create(admin, { ...input(), points: -1 }), denied(400));
  const f = await fixture();
  await assert.rejects(offers.reviewOffer(admin, f.offer.id, { status: "rejected", reason: "          " }), denied(400));
});

test("expired offers disappear and cannot start, but timely attributed clicks can settle afterward", async () => {
  const user = await account();
  await assert.rejects(offers.create(admin, { ...input(), expiresAt: "2020-01-01T00:00:00.000Z" }), denied(400));
  const offer = await offers.create(admin, { ...input(), expiresAt: new Date(Date.now() + 1500).toISOString() });
  await offers.reviewOffer(admin, offer.id, { status: "approved", reason });
  const start = await offers.start(user, offer.id, { idempotencyKey: randomUUID() });
  await new Promise(resolve => setTimeout(resolve, 1550));
  assert.ok(!(await offers.listOffers(user)).items.some(o => o.id === offer.id));
  await assert.rejects(offers.start(user, offer.id, { idempotencyKey: randomUUID() }), denied(404));
  const v = await send({ user, offer, start });
  await review(v.id);
  assert.equal((await ledger.wallet(user)).balance, 37);
});

async function approvedFixture() {
  const f = await fixture(), eventId = randomUUID(), v = await send(f, "verified", eventId);
  await review(v.id);
  return { ...f, eventId, v };
}
const reverse = (id, key = randomUUID(), actor = admin, why = reason) =>
  offers.reverseConversion(actor, id, { idempotencyKey: key, reason: why });

test("signed withdrawal cannot rewrite already approved terminal evidence or its ledger", async () => {
  const f = await approvedFixture();
  const request = signed({ clickId: f.start.clickId, eventId: f.eventId, status: "rejected" });
  const before = await ledger.history(f.user);
  await assert.rejects(offers.callback("test-partner", request.raw, request.headers), denied(409));
  assert.deepEqual(await ledger.history(f.user), before);
  assert.equal((await ledger.wallet(f.user)).balance, 37);
  assert.equal((await offers.listConversions(f.user)).items[0].partnerStatus, "verified");
  assert.equal((await isolated.query("SELECT 1 FROM v2_offer_callback_receipts WHERE nonce=$1", [request.headers.nonce])).rowCount, 0);
  await assert.rejects(isolated.query("UPDATE v2_offer_conversions SET partner_status='rejected' WHERE id=$1", [f.v.id]), /Terminal partner evidence/);
});

test("full reversal preserves signed proof and records immutable linked events and both audits", async () => {
  const f = await approvedFixture(), key = randomUUID(), result = await reverse(f.v.id, key);
  assert.equal(result.replayed, false);
  assert.equal(result.conversion.status, "reversed");
  assert.equal(result.conversion.partnerStatus, "verified");
  assert.equal(result.conversion.transactionId, f.v.transactionId);
  assert.equal(result.compensation.type, "REVERSAL");
  assert.equal(result.compensation.amount, -37);
  assert.equal(result.compensation.relatedTransactionId, f.v.transactionId);
  assert.equal(result.wallet.balance, 0);
  assert.equal(result.wallet.available, 0);
  assert.equal(result.wallet.lifetimeEarned, 0);
  assert.equal(result.conversion.reversalEvents.length, 1);
  assert.equal(result.conversion.reversalEvents[0].compensationTransactionId, result.compensation.id);
  assert.equal(result.conversion.reversalEvents[0].reason, reason);
  const original = (await ledger.history(f.user)).items.find(t => t.id === f.v.transactionId);
  assert.deepEqual(original.events.map(e => e.status), ["pending", "approved", "reversed"]);
  assert.equal(original.events.at(-1).delta, 0);
  const audits = (await isolated.query(`SELECT action,metadata FROM v2_audit_logs
    WHERE (entity_id=$1 AND action='OFFER_CONVERSION_REVERSED') OR (entity_id=$2 AND action='POINTS_COMPENSATE')`,
    [f.v.id, result.compensation.id])).rows;
  assert.equal(audits.length, 2);
  const audit = audits.find(a => a.action === "OFFER_CONVERSION_REVERSED").metadata;
  assert.equal(audit.beforeWallet.balance, 37);
  assert.equal(audit.afterWallet.balance, 0);
  const dup = await send(f, "verified", f.eventId);
  assert.equal(dup.status, "reversed");
  await assert.rejects(send(f, "rejected", f.eventId), denied(409));
  await assert.rejects(review(f.v.id), denied(409));
  await assert.rejects(reverse(f.v.id), denied(409));
  await assert.rejects(ledger.execute({ kind: "compensate", actorId: admin, transactionId: result.compensation.id,
    type: "REVERSAL", reason, idempotencyKey: randomUUID() }), denied(409));
  assert.equal((await ledger.history(f.user)).items.length, 2);
  await assert.rejects(isolated.query("UPDATE v2_offer_reversal_events SET reason=$2 WHERE conversion_id=$1", [f.v.id, reason]), /append-only/);
  await assert.rejects(isolated.query("DELETE FROM v2_offer_reversal_events WHERE conversion_id=$1", [f.v.id]), /append-only/);
  await assert.rejects(isolated.query("UPDATE v2_offer_conversions SET status='verified' WHERE id=$1", [f.v.id]), /lifecycle/);
  // Idempotent replay returns current wallet, not the original snapshot.
  await ledger.execute({ kind: "adjust", actorId: admin, accountId: f.user, amount: 5, reason, idempotencyKey: randomUUID() });
  const replay = await reverse(f.v.id, key, admin, `  ${reason}  `);
  assert.equal(replay.replayed, true);
  assert.equal(replay.compensation.id, result.compensation.id);
  assert.equal(replay.wallet.balance, 5);
});

test("reversal validates intent, ownership, role and active status, including on replay", async () => {
  const f = await approvedFixture(), key = randomUUID();
  for (const role of ["USER", "PARTNER"]) await assert.rejects(reverse(f.v.id, key, await account(role)), denied(403));
  for (const extra of [{ amount: 1 }, { accountId: f.user }, { type: "REFUND" }, { status: "rejected" }]) {
    await assert.rejects(offers.reverseConversion(admin, f.v.id, { reason, idempotencyKey: key, ...extra }), denied(400));
  }
  await assert.rejects(reverse(f.v.id, key, admin, "          "), denied(400));
  await assert.rejects(reverse(f.v.id, "short"), denied(400));
  await assert.rejects(reverse(randomUUID()), denied(404));
  const pending = await fixture(), pendingV = await send(pending);
  await assert.rejects(reverse(pendingV.id), denied(409));
  await review(pendingV.id, "rejected");
  await assert.rejects(reverse(pendingV.id), denied(409));
  await isolated.query("UPDATE v2_accounts SET status='SUSPENDED' WHERE id=$1", [f.user]);
  try { await assert.rejects(reverse(f.v.id, key), denied(403)); }
  finally { await isolated.query("UPDATE v2_accounts SET status='ACTIVE' WHERE id=$1", [f.user]); }
  await reverse(f.v.id, key);
  await assert.rejects(reverse(f.v.id, key, admin, "En helt annen konkret begrunnelse"), denied(409));
  const otherAdmin = await account("SUPER_ADMIN");
  await assert.rejects(reverse(f.v.id, key, otherAdmin), denied(409));
  const other = await approvedFixture();
  await assert.rejects(reverse(other.v.id, key), denied(409));
  await isolated.query("UPDATE v2_accounts SET role='USER' WHERE id=$1", [otherAdmin]);
  await assert.rejects(reverse(f.v.id, key, otherAdmin), denied(403));
  await isolated.query("UPDATE v2_accounts SET status='SUSPENDED' WHERE id=$1", [admin]);
  try { await assert.rejects(reverse(f.v.id, key), denied(403)); }
  finally { await isolated.query("UPDATE v2_accounts SET status='ACTIVE' WHERE id=$1", [admin]); }
});

test("concurrent duplicate keys replay once, different keys have only one durable reversal", async () => {
  const f = await approvedFixture(), key = randomUUID();
  const results = await Promise.all([reverse(f.v.id, key), reverse(f.v.id, key), reverse(f.v.id, key)]);
  assert.equal(results.filter(r => !r.replayed).length, 1);
  assert.equal(new Set(results.map(r => r.compensation.id)).size, 1);
  const g = await approvedFixture();
  const competing = await Promise.allSettled([reverse(g.v.id), reverse(g.v.id)]);
  assert.equal(competing.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(competing.find(r => r.status === "rejected").reason.status, 409);
  assert.equal((await ledger.history(g.user)).items.length, 2);
  // A duplicate verified callback racing reversal must not restore approval.
  const h = await approvedFixture();
  await Promise.all([reverse(h.v.id), send(h, "verified", h.eventId)]);
  assert.equal((await offers.listConversions(h.user)).items[0].status, "reversed");
  assert.equal((await ledger.wallet(h.user)).balance, 0);
});

async function redeem(f, status) {
  return ledger.execute({ kind: "record", actorId: admin, accountId: f.user, type: "REDEEM", amount: -20,
    status, source: "isolated-test-redemption", reference: randomUUID(), description: "Syntetisk poengtrekk",
    reason, idempotencyKey: randomUUID() });
}
test("spent credit cannot make balance negative; failures leave no reversal or request and can retry", async () => {
  const f = await approvedFixture(), key = randomUUID();
  await redeem(f, "approved");
  const before = await ledger.history(f.user);
  await assert.rejects(reverse(f.v.id, key), denied(409));
  assert.deepEqual(await ledger.history(f.user), before);
  assert.equal((await ledger.wallet(f.user)).balance, 17);
  assert.equal((await offers.listConversions(f.user)).items[0].status, "verified");
  assert.equal((await isolated.query("SELECT 1 FROM v2_offer_reversal_events WHERE conversion_id=$1", [f.v.id])).rowCount, 0);
  await ledger.execute({ kind: "adjust", actorId: admin, accountId: f.user, amount: 20, reason, idempotencyKey: randomUUID() });
  assert.equal((await reverse(f.v.id, key)).wallet.balance, 0);
});
test("reserved points cannot be consumed by reversal; releasing reservation allows same-key retry", async () => {
  const f = await approvedFixture(), key = randomUUID(), debit = await redeem(f, "pending");
  const before = await ledger.history(f.user);
  await assert.rejects(reverse(f.v.id, key), denied(409));
  assert.deepEqual(await ledger.history(f.user), before);
  assert.equal((await ledger.wallet(f.user)).reserved, 20);
  assert.equal((await ledger.wallet(f.user)).available, 17);
  await ledger.execute({ kind: "decide", actorId: admin, transactionId: debit.transaction.id, status: "rejected",
    reason, idempotencyKey: randomUUID() });
  assert.equal((await reverse(f.v.id, key)).wallet.reserved, 0);
});
test("concurrent reservation and reversal cannot overspend available balance", async () => {
  const f = await approvedFixture();
  const results = await Promise.allSettled([reverse(f.v.id), redeem(f, "pending")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
  const wallet = await ledger.wallet(f.user);
  assert.ok(wallet.balance >= 0 && wallet.reserved >= 0 && wallet.available >= 0);
});
test("failure after ledger compensation rolls back conversion, both audits, lifecycle and key", async () => {
  const f = await approvedFixture(), key = randomUUID(), before = await ledger.history(f.user);
  const audits = Number((await isolated.query("SELECT count(*) FROM v2_audit_logs")).rows[0].count);
  const requests = Number((await isolated.query("SELECT count(*) FROM v2_points_requests")).rows[0].count);
  await isolated.query(`CREATE FUNCTION fail_offer_reversal_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Synthetic reversal failure after ledger write'; END; $$;
    CREATE TRIGGER fail_offer_reversal BEFORE INSERT ON v2_offer_reversal_events FOR EACH ROW EXECUTE FUNCTION fail_offer_reversal_test()`);
  try { await assert.rejects(reverse(f.v.id, key), /Synthetic reversal failure/); }
  finally { await isolated.query("DROP TRIGGER fail_offer_reversal ON v2_offer_reversal_events; DROP FUNCTION fail_offer_reversal_test()"); }
  assert.deepEqual(await ledger.history(f.user), before);
  assert.equal((await offers.listConversions(f.user)).items[0].status, "verified");
  assert.equal(Number((await isolated.query("SELECT count(*) FROM v2_audit_logs")).rows[0].count), audits);
  assert.equal(Number((await isolated.query("SELECT count(*) FROM v2_points_requests")).rows[0].count), requests);
  assert.equal((await reverse(f.v.id, key)).replayed, false);
});
test("SQL rejects lifecycle-only reversal; corrections remain possible with earn gate and partner paused", async () => {
  const f = await approvedFixture();
  await assert.rejects(isolated.query("UPDATE v2_offer_conversions SET status='reversed' WHERE id=$1", [f.v.id]), /lifecycle event/);
  await offers.reviewOffer(admin, f.offer.id, { status: "rejected", reason });
  await isolated.query("UPDATE v2_offer_partners SET active=false WHERE id='test-partner'");
  await isolated.query("UPDATE v2_earn_gate SET earn_enabled=false");
  try {
    assert.equal((await reverse(f.v.id)).conversion.status, "reversed");
    assert.equal((await offers.listOffers(f.user)).earnEnabled, false);
  } finally {
    await isolated.query("UPDATE v2_offer_partners SET active=true WHERE id='test-partner'");
    await isolated.query("UPDATE v2_earn_gate SET earn_enabled=true");
  }
});
