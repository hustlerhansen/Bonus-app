import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { applyV2Migrations, createTestBudget } from "./fixtures.mjs";

// Real PostgreSQL, isolated schema. No HTTP seed endpoint or demo balance import.
// DATABASE_URL is used by the normal db module, never printed or copied.
const out = new URL("../.cache/v2-points-test.mjs", import.meta.url);
await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
await build({
  stdin: { contents: 'export * from "./src/v2/points"; export * from "./src/v2/points-reconciliation"; export * from "./src/v2/points-monitor"; export { pool } from "@workspace/db";',
    resolveDir: new URL("../", import.meta.url).pathname, loader: "ts" },
  outfile: out.pathname, bundle: true, platform: "node", format: "esm",
  external: ["pg-native"],
  banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
});
const { createPointsLedger, createPointsReconciler, analyzePointsSnapshot, pointsAccountRef, startPointsMonitor, pool } = await import(out.href);
const schema = `points_test_${randomUUID().replaceAll("-", "")}`;
const isolated = new pool.constructor({ ...pool.options, options: `-c search_path=${schema}`, max: 10 });
const ledger = createPointsLedger(isolated);
let admin, budget;
const reason = "Kontrollert poenghendelse i isolert test";
async function account(role = "USER", status = "ACTIVE") {
  const id = `test_${randomUUID()}`;
  await isolated.query(`INSERT INTO v2_accounts(id,email,first_name,last_name,role,status,referral_code,
    terms_version,privacy_version,terms_accepted_at,privacy_accepted_at,email_verified_at,last_session_id)
    VALUES($1,$2,'Test','Ledger',$3,$4,$1,'test','test',now(),now(),now(),'test')`, [id, `${id}@example.invalid`, role, status]);
  return id;
}
function adjust(accountId, amount, extra = {}) {
  return ledger.execute({ kind: "adjust", accountId, amount, actorId: admin, reason, idempotencyKey: randomUUID(),
    ...(amount > 0 ? { fundingBudgetId: budget } : {}), ...extra });
}
function record(accountId, type, amount, status = "approved", extra = {}) {
  return ledger.execute({ kind: "record", accountId, type, amount, status, actorId: admin, reason,
    ...(["EARN", "REFERRAL", "BONUS"].includes(type) ? { funding: { kind: "budget", reference: budget } } : {}),
    source: "verified-test", reference: randomUUID(), description: "Verifisert testhendelse", idempotencyKey: randomUUID(), ...extra });
}
function compensate(transactionId, type = "REVERSAL", extra = {}) {
  return ledger.execute({ kind: "compensate", transactionId, type, actorId: admin, reason, idempotencyKey: randomUUID(), ...extra });
}
function decide(transactionId, status, extra = {}) {
  return ledger.execute({ kind: "decide", transactionId, status, actorId: admin, reason, idempotencyKey: randomUUID(), ...extra });
}
const denied = (status) => e => e.status === status;
before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  await applyV2Migrations(isolated);
  admin = await account("ADMIN");
  budget = await createTestBudget(isolated, admin);
});
after(async () => {
  await isolated.end();
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
});

test("new V2 accounts start at zero, no imported demo balance", async () => {
  const id = await account();
  assert.deepEqual(await ledger.wallet(id), {
    accountId: id, available: 0, balance: 0, pending: 0, reserved: 0, lifetimeEarned: 0, lifetimeRedeemed: 0,
  });
});

test("duplicate simultaneous request credits once; changed payload replay conflicts globally", async () => {
  const id = await account(), key = randomUUID();
  const results = await Promise.all([adjust(id, 100, { idempotencyKey: key }), adjust(id, 100, { idempotencyKey: key })]);
  assert.equal(results[0].transaction.id, results[1].transaction.id);
  assert.deepEqual(results.map(r => r.replayed).sort(), [false, true]);
  assert.equal((await ledger.wallet(id)).available, 100);
  await assert.rejects(adjust(id, 101, { idempotencyKey: key }), denied(409));
  await assert.rejects(adjust(await account(), 100, { idempotencyKey: key }), denied(409));
  assert.equal((await ledger.history(id)).items.length, 1);
});
test("verified source cannot award twice even with different request keys or recipient", async () => {
  const id = await account(), reference = randomUUID();
  await record(id, "EARN", 150, "approved", { reference });
  await assert.rejects(record(id, "EARN", 150, "approved", { reference }), denied(409));
  await assert.rejects(record(await account(), "EARN", 150, "approved", { reference }), denied(409));
  assert.equal((await ledger.wallet(id)).lifetimeEarned, 150);
});
test("insufficient and concurrent approved debits cannot overdraw", async () => {
  const id = await account();
  await assert.rejects(adjust(id, -1), denied(409));
  await adjust(id, 100);
  const results = await Promise.allSettled([record(id, "REDEEM", -80), record(id, "REDEEM", -80)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
  assert.equal((await ledger.wallet(id)).available, 20);
});
test("pending credit approval is append-only, idempotent, and rejects second decision", async () => {
  const id = await account();
  const pending = await record(id, "EARN", 200, "pending");
  assert.equal(pending.wallet.available, 0);
  assert.equal(pending.wallet.pending, 200);
  const key = randomUUID();
  await decide(pending.transaction.id, "approved", { idempotencyKey: key });
  const replay = await decide(pending.transaction.id, "approved", { idempotencyKey: key });
  assert.equal(replay.replayed, true);
  assert.equal(replay.wallet.available, 200);
  assert.equal(replay.wallet.pending, 0);
  assert.deepEqual(replay.transaction.events.map(e => e.status), ["pending", "approved"]);
  await assert.rejects(decide(pending.transaction.id, "rejected"), denied(409));
});
test("pending debit reserves funds and rejection releases them without credit creation", async () => {
  const id = await account();
  await adjust(id, 100);
  const p = await record(id, "REDEEM", -80, "pending");
  assert.equal(p.wallet.balance, 100);
  assert.equal(p.wallet.reserved, 80);
  assert.equal(p.wallet.available, 20);
  await assert.rejects(record(id, "REDEEM", -21, "pending"), denied(409));
  await assert.rejects(adjust(id, -21), denied(409));
  const rejected = await decide(p.transaction.id, "rejected");
  assert.equal(rejected.wallet.balance, 100);
  assert.equal(rejected.wallet.available, 100);
  assert.equal(rejected.wallet.reserved, 0);
  await assert.rejects(decide(p.transaction.id, "approved"), denied(409));
});
test("concurrent reservations and competing decisions serialize safely", async () => {
  const id = await account();
  await adjust(id, 100);
  const rs = await Promise.allSettled([record(id, "REDEEM", -70, "pending"), record(id, "REDEEM", -70, "pending")]);
  assert.equal(rs.filter(r => r.status === "fulfilled").length, 1);
  const pending = rs.find(r => r.status === "fulfilled").value.transaction;
  const ds = await Promise.allSettled([decide(pending.id, "approved"), decide(pending.id, "rejected")]);
  assert.equal(ds.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(ds.find(r => r.status === "rejected").reason.status, 409);
  const w = await ledger.wallet(id);
  assert.equal(w.reserved, 0);
  assert.ok([30, 100].includes(w.available));
});
test("approval consumes its own reservation but credit reversal cannot spend reserved funds", async () => {
  const id = await account();
  const credit = await record(id, "EARN", 100);
  const pending = await record(id, "REDEEM", -80, "pending");
  await assert.rejects(compensate(credit.transaction.id), denied(409));
  const approved = await decide(pending.transaction.id, "approved");
  assert.equal(approved.wallet.balance, 20);
  assert.equal(approved.wallet.available, 20);
  assert.equal(approved.wallet.reserved, 0);
  assert.equal(approved.wallet.lifetimeRedeemed, 80);
  assert.equal((await ledger.history(id)).items.find(t => t.id === credit.transaction.id).status, "approved");
});
test("full refund amount is original server debit; replay and alternative compensation cannot duplicate", async () => {
  const id = await account();
  await record(id, "BONUS", 200);
  const debit = await record(id, "REDEEM", -80);
  const key = randomUUID();
  const refund = await compensate(debit.transaction.id, "REFUND", { idempotencyKey: key });
  assert.equal(refund.transaction.amount, 80);
  assert.equal(refund.transaction.relatedTransactionId, debit.transaction.id);
  assert.equal(refund.wallet.available, 200);
  assert.equal(refund.wallet.lifetimeRedeemed, 0);
  assert.equal((await compensate(debit.transaction.id, "REFUND", { idempotencyKey: key })).replayed, true);
  await assert.rejects(compensate(debit.transaction.id), denied(409));
  await assert.rejects(compensate(refund.transaction.id), denied(409));
  assert.equal((await ledger.history(id)).items.find(t => t.id === debit.transaction.id).status, "reversed");
});
test("reversal of spent credit fails atomically; later safe retry succeeds", async () => {
  const id = await account();
  const credit = await record(id, "EARN", 100);
  await record(id, "REDEEM", -80);
  const key = randomUUID();
  await assert.rejects(compensate(credit.transaction.id, "REVERSAL", { idempotencyKey: key }), denied(409));
  assert.equal((await ledger.history(id)).items.find(t => t.id === credit.transaction.id).status, "approved");
  await adjust(id, 80);
  const reversed = await compensate(credit.transaction.id, "REVERSAL", { idempotencyKey: key });
  assert.equal(reversed.transaction.amount, -100);
  assert.equal(reversed.wallet.available, 0);
  assert.equal(reversed.wallet.lifetimeEarned, 0);
});
test("refund of positive points and reversal of pending transaction are forbidden", async () => {
  const id = await account();
  const positive = await record(id, "REFERRAL", 10);
  await assert.rejects(compensate(positive.transaction.id, "REFUND"), denied(409));
  const pending = await record(id, "BONUS", 10, "pending");
  await assert.rejects(compensate(pending.transaction.id), denied(409));
  assert.equal((await ledger.wallet(id)).available, 10);
});
test("concurrent refund and reversal of the same debit compensate only once", async () => {
  const id = await account();
  await adjust(id, 100);
  const debit = await record(id, "REDEEM", -90);
  const rs = await Promise.allSettled([compensate(debit.transaction.id, "REFUND"), compensate(debit.transaction.id)]);
  assert.equal(rs.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await ledger.wallet(id)).available, 100);
});
test("all eight types and expiration debit; amounts and mandatory reason validated", async () => {
  const id = await account();
  await record(id, "EARN", 50);
  await record(id, "BONUS", 50);
  await record(id, "REFERRAL", 50);
  await record(id, "EXPIRATION", -30);
  assert.equal((await ledger.wallet(id)).available, 120);
  for (const amount of [0, 1.5, -1000001, 1000001, NaN]) await assert.rejects(adjust(id, amount), denied(400));
  await assert.rejects(adjust(id, 1, { reason: "          " }), denied(400));
  await assert.rejects(record(id, "EARN", -10), denied(400));
  await assert.rejects(record(id, "REDEEM", 10), denied(400));
  await assert.rejects(adjust(id, 1, { idempotencyKey: "short" }), denied(400));
});
test("users, partners, suspended admin, deleted recipient and missing actors cannot change points", async () => {
  const id = await account();
  for (const role of ["USER", "PARTNER"]) {
    await assert.rejects(adjust(id, 100, { actorId: await account(role) }), denied(403));
  }
  await assert.rejects(adjust(id, 100, { actorId: await account("ADMIN", "SUSPENDED") }), denied(403));
  await assert.rejects(adjust(id, 100, { actorId: "demo-admin" }), denied(403));
  await assert.rejects(adjust(await account("USER", "DELETION_REQUESTED"), 100), denied(403));
  await assert.rejects(adjust("missing", 100), denied(404));
  const superAdmin = await account("SUPER_ADMIN");
  assert.equal((await adjust(id, 10, { actorId: superAdmin })).wallet.available, 10);
});
test("audit includes authenticated actor, reason and before/after; replay writes no audit", async () => {
  const id = await account(), key = randomUUID();
  const result = await adjust(id, 100, { idempotencyKey: key });
  await adjust(id, 100, { idempotencyKey: key });
  const audits = await isolated.query("SELECT * FROM v2_audit_logs WHERE entity_id=$1", [result.transaction.id]);
  assert.equal(audits.rowCount, 1);
  assert.equal(audits.rows[0].actor_id, admin);
  assert.equal(audits.rows[0].metadata.reason, reason);
  assert.equal(audits.rows[0].metadata.before.available, 0);
  assert.equal(audits.rows[0].metadata.after.available, 100);
});
test("keyset pagination is scoped, bounded and stable when a newer transaction arrives", async () => {
  const id = await account(), other = await account();
  for (let i = 0; i < 5; i++) await adjust(id, 1);
  await adjust(other, 100);
  const first = await ledger.history(id, undefined, 2);
  assert.equal(first.items.length, 2);
  await adjust(id, 1);
  const second = await ledger.history(id, first.nextCursor, 2);
  const third = await ledger.history(id, second.nextCursor, 2);
  const items = [...first.items, ...second.items, ...third.items];
  assert.equal(new Set(items.map(t => t.id)).size, 5);
  assert.ok(items.every(t => t.accountId === id));
  assert.equal(third.nextCursor, null);
  assert.deepEqual((await ledger.history(other)).items.map(t => t.amount), [100]);
  for (const limit of [0, 101, 1.5]) await assert.rejects(ledger.history(id, undefined, limit), denied(400));
  await assert.rejects(ledger.history(id, "9223372036854775808"), denied(400));
});
test("database rejects overwriting or deleting ledger, events, requests and audit", async () => {
  const id = await account(), result = await adjust(id, 10);
  for (const table of ["v2_points_transactions", "v2_points_events", "v2_points_requests", "v2_audit_logs"]) {
    await assert.rejects(isolated.query(`DELETE FROM ${table}`), /append-only/);
  }
  await assert.rejects(isolated.query("UPDATE v2_points_transactions SET amount=20 WHERE id=$1", [result.transaction.id]), /append-only/);
  assert.equal((await ledger.wallet(id)).available, 10);
});

async function snapshot() {
  const transactions = await isolated.query(`SELECT id,account_id,type,amount,source,reference,
    related_transaction_id,actor_id FROM v2_points_transactions ORDER BY sequence`);
  const events = await isolated.query(`SELECT sequence::text,transaction_id,status,delta,reserved_delta,actor_id
    FROM v2_points_events ORDER BY sequence`);
  const requests = await isolated.query("SELECT idempotency_key,transaction_id,actor_id FROM v2_points_requests");
  const audits = await isolated.query(`SELECT id,actor_id,action,entity_type,entity_id,metadata->>'accountId' AS account_id,
    metadata->>'requestKey' AS request_key,metadata->'before' AS before,metadata->'after' AS after
    FROM v2_audit_logs WHERE entity_type='POINTS_TRANSACTION'`);
  return { transactions: transactions.rows, events: events.rows, requests: requests.rows, audits: audits.rows };
}

test("read-only reconciliation accepts all healthy lifecycles and does not write any rows", async () => {
  const before = await snapshot();
  const report = await createPointsReconciler(isolated)();
  assert.equal(report.status, "ok", JSON.stringify(report.findings));
  assert.equal(report.requiresOperatorReview, false);
  assert.deepEqual(report.findings, []);
  assert.equal(report.counts.transactions, before.transactions.length);
  assert.deepEqual(await snapshot(), before);
});

test("isolated fault fixtures detect effects, reservations, lifecycle, compensation, origin and audit drift", async (t) => {
  const id = await account();
  await adjust(id, 500);
  const pending = await record(id, "REDEEM", -30, "pending");
  const debit = await record(id, "REDEEM", -40);
  const refund = await compensate(debit.transaction.id, "REFUND");
  const clean = await snapshot();
  assert.equal(analyzePointsSnapshot(clean, "fixture").status, "ok");
  const index = clean.events.findIndex(e => e.transaction_id === pending.transaction.id);
  const refundIndex = clean.transactions.findIndex(t => t.id === refund.transaction.id);
  const auditIndex = clean.audits.findIndex(a => a.entity_id === pending.transaction.id);
  const faults = [
    ["EVENT_EFFECT_MISMATCH", s => { s.events[index].delta = 30; }],
    ["TRANSACTION_TOTAL_MISMATCH", s => { s.events[index].reserved_delta = 0; }],
    ["INVALID_LIFECYCLE", s => { s.events[index].status = "rejected"; }],
    ["MISSING_EVENT", s => { s.events = s.events.filter(e => e.transaction_id !== pending.transaction.id); }],
    ["ACCOUNT_BALANCE_INVARIANT", s => { s.events[index].reserved_delta = 1000000; }],
    ["INVALID_COMPENSATION", s => { s.transactions[refundIndex].amount = 39; }],
    ["INVALID_COMPENSATION", s => { s.transactions[refundIndex].account_id = admin; }],
    ["INVALID_COMPENSATION", s => { s.transactions[refundIndex].related_transaction_id = randomUUID(); }],
    ["DUPLICATE_COMPENSATION", s => { s.transactions.push({ ...s.transactions[refundIndex], id: randomUUID(), reference: randomUUID() }); }],
    ["COMPENSATION_LINK_MISMATCH", s => { s.events = s.events.filter(e => !(e.transaction_id === debit.transaction.id && e.status === "reversed")); }],
    ["COMPENSATION_LINK_MISMATCH", s => { s.transactions = s.transactions.filter(t => t.id !== refund.transaction.id); }],
    ["DUPLICATE_ORIGIN", s => { s.transactions.push({ ...s.transactions[refundIndex], id: randomUUID(), related_transaction_id: null }); }],
    ["EVENT_WITHOUT_AUDIT", s => { s.audits.splice(auditIndex, 1); }],
    ["EVENT_MULTIPLE_AUDITS", s => { s.audits.push({ ...s.audits[auditIndex], id: randomUUID() }); }],
    ["AUDIT_BALANCE_MISMATCH", s => { s.audits[auditIndex].after.balance += 1; }],
    ["AUDIT_BALANCE_MISMATCH", s => { s.audits[auditIndex].before.balance += 10; s.audits[auditIndex].after.balance += 10; }],
    ["AUDIT_BALANCE_MISMATCH", s => { s.audits[auditIndex].after = null; }],
    ["AUDIT_REQUEST_MISMATCH", s => { s.audits[auditIndex].request_key = "missing"; }],
    ["AUDIT_REQUEST_MISMATCH", s => { s.audits[auditIndex].account_id = admin; }],
    ["AUDIT_ACTOR_MISMATCH", s => { s.audits[auditIndex].actor_id = id; }],
    ["AUDIT_ACTION_MISMATCH", s => { s.audits[auditIndex].action = "POINTS_UNKNOWN"; }],
    ["AUDIT_ENTITY_MISMATCH", s => { s.audits[auditIndex].entity_type = "WRONG"; }],
    ["REQUEST_AUDIT_CARDINALITY", s => { s.requests.push({ idempotency_key: randomUUID(), transaction_id: pending.transaction.id, actor_id: admin }); }],
    ["DUPLICATE_REQUEST", s => { s.requests.push({ ...s.requests[0] }); }],
    ["ORPHAN_REQUEST", s => { s.requests[0].transaction_id = randomUUID(); }],
    ["ORPHAN_EVENT", s => { s.events[index].transaction_id = randomUUID(); }],
    ["ORPHAN_AUDIT", s => { s.audits[auditIndex].entity_id = randomUUID(); }],
  ];
  for (const [code, corrupt] of faults) {
    await t.test(code, () => {
      const fixture = structuredClone(clean);
      corrupt(fixture); // Memory only: append-only history and constraints stay intact.
      const result = analyzePointsSnapshot(fixture, "fixture");
      assert.equal(result.requiresOperatorReview, true);
      assert.ok(result.findings.some(f => f.code === code), JSON.stringify(result.findings));
      assert.ok(result.findings.every(f => f.transactionRef || f.code === "ORPHAN_REQUEST"));
    });
  }
  assert.deepEqual(await snapshot(), clean);
});

test("reports expose only hashed account and technical references, never sensitive/free-text values", async () => {
  const fixture = await snapshot();
  const target = fixture.transactions[0];
  const secretLike = "someone@example.invalid secret://credential";
  target.account_id = secretLike;
  target.source = secretLike;
  target.reference = secretLike;
  fixture.audits[0].id = secretLike;
  fixture.audits[0].request_key = secretLike;
  const report = analyzePointsSnapshot(fixture, "fixture");
  assert.ok(report.findings.some(f => f.accountRef === pointsAccountRef(secretLike)));
  assert.ok(!JSON.stringify(report).includes(secretLike));
  assert.ok(!JSON.stringify(report).includes(admin));
  for (const f of report.findings) {
    assert.ok(Object.keys(f).every(k => ["code", "accountRef", "transactionRef", "eventRef", "auditRef"].includes(k)));
  }
});

test("snapshot remains consistent when a financial mutation commits between read queries", async () => {
  const id = await account();
  const database = {
    async connect() {
      const client = await isolated.connect();
      return {
        release: () => client.release(),
        async query(sql, values) {
          const result = await client.query(sql, values);
          if (sql.includes("FROM v2_points_transactions ORDER BY sequence")) await adjust(id, 12);
          return result;
        },
      };
    },
  };
  const report = await createPointsReconciler(database)();
  assert.equal(report.status, "ok", JSON.stringify(report.findings));
  assert.equal((await ledger.wallet(id)).balance, 12);
});

test("database enforces read-only mode and scheduler avoids concurrent replicas", async () => {
  let writeRejected = false, readOnly = false;
  const database = {
    async connect() {
      const client = await isolated.connect();
      return {
        release: () => client.release(),
        async query(sql, values) {
          const result = await client.query(sql, values);
          if (sql.startsWith("BEGIN")) {
            readOnly = (await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only === "on";
          }
          if (sql.includes("transaction_timestamp()")) {
            try { await client.query("DELETE FROM v2_points_events"); }
            catch (e) { writeRejected = e.code === "25006"; throw e; }
          }
          return result;
        },
      };
    },
  };
  await assert.rejects(createPointsReconciler(database)(), e => e.code === "25006");
  assert.equal(readOnly, true);
  assert.equal(writeRejected, true);
  const holder = await isolated.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(20761009, 7)");
    assert.equal(await createPointsReconciler(isolated)({ scheduled: true }), null);
  } finally { await holder.query("ROLLBACK"); holder.release(); }
  assert.equal((await createPointsReconciler(isolated)({ scheduled: true })).status, "ok");
});

test("scheduled checks alert on drift and failure, sanitize errors and do not overlap", async () => {
  const logs = [];
  const logger = { info: (data) => logs.push(data), error: (data) => logs.push(data) };
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const monitor = startPointsMonitor(logger, async () => {
    calls++;
    await gate;
    return { checkedAt: "fixture", counts: {}, requiresOperatorReview: true,
      findings: [{ code: "MISSING_EVENT", accountRef: pointsAccountRef("synthetic"), transactionRef: randomUUID() }] };
  }, 10);
  try {
    await monitor.check();
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(calls, 1);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(logs.some(l => l.code === "POINTS_RECONCILIATION_DRIFT"));
    assert.ok(logs.some(l => l.code === "POINTS_RECONCILIATION_FINDINGS"));
  } finally { monitor.stop(); }
  const failing = startPointsMonitor(logger, async () => { throw new Error("password=do-not-log someone@example.invalid"); }, 10000);
  await new Promise(resolve => setTimeout(resolve, 0));
  failing.stop();
  assert.ok(logs.some(l => l.code === "POINTS_RECONCILIATION_FAILED"));
  assert.ok(!JSON.stringify(logs).includes("do-not-log"));
  const count = calls;
  await monitor.check();
  assert.equal(calls, count);
});
