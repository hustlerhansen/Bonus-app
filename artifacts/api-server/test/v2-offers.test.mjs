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
  for (const name of ["0001_v2_identity.sql", "0002_v2_points.sql", "0003_v2_offers.sql"]) {
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
