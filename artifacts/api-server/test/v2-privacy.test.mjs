import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import { applyV2Migrations, createTestBudget } from "./fixtures.mjs";

// Isolated PostgreSQL schema. Private demo access, GDPR export and deletion request.
const out = new URL("../.cache/v2-privacy-test.mjs", import.meta.url);
await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
await build({
  stdin: { contents: `export * from "./src/v2/demo-access"; export * from "./src/v2/privacy"; export * from "./src/v2/points"; export { pool } from "@workspace/db";`,
    resolveDir: new URL("../", import.meta.url).pathname, loader: "ts" },
  outfile: out.pathname, bundle: true, platform: "node", format: "esm", external: ["pg-native"],
  banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
});
const { pool, demoAccess, createTesterService, exportAccountData, requestDeletion, createPointsLedger } = await import(out.href);
const schema = `privacy_test_${randomUUID().replaceAll("-", "")}`;
const isolated = new pool.constructor({ ...pool.options, options: `-c search_path=${schema}`, max: 6 });
const testers = createTesterService(isolated);
const ledger = createPointsLedger(isolated);
const denied = status => e => e.status === status;
let admin, budget;
async function account(role = "USER") {
  const id = `test_${randomUUID()}`;
  await isolated.query(`INSERT INTO v2_accounts(id,email,first_name,last_name,role,referral_code,
    terms_version,privacy_version,terms_accepted_at,privacy_accepted_at,email_verified_at,last_session_id)
    VALUES($1,$2,'Test','Privat',$3,$1,'test','test',now(),now(),now(),'test')`, [id, `${id}@example.invalid`, role]);
  return id;
}

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

test("the demo is private: only listed, active accounts get access; demo admin needs an explicit flag", async () => {
  const user = await account(), other = await account();
  assert.deepEqual(await demoAccess(isolated, null), { tester: false, canAdmin: false });
  assert.deepEqual(await demoAccess(isolated, user), { tester: false, canAdmin: false });
  await assert.rejects(testers.add(user, { email: `${other}@example.invalid`, canAdmin: false, note: "Forsøk" }), denied(403));
  await assert.rejects(testers.add(admin, { email: "missing@example.invalid", canAdmin: false, note: "Mangler" }), denied(404));
  await testers.add(admin, { email: `${user}@example.invalid`, canAdmin: false, note: "Lukket test" });
  assert.deepEqual(await demoAccess(isolated, user), { tester: true, canAdmin: false });
  await testers.add(admin, { email: `${user}@example.invalid`.toUpperCase(), canAdmin: true, note: "Demoadmin" });
  assert.deepEqual(await demoAccess(isolated, user), { tester: true, canAdmin: true });
  assert.equal((await testers.list(admin)).items.length, 1);
  await isolated.query("UPDATE v2_accounts SET status='SUSPENDED' WHERE id=$1", [user]);
  assert.equal((await demoAccess(isolated, user)).tester, false);
  await isolated.query("UPDATE v2_accounts SET status='ACTIVE' WHERE id=$1", [user]);
  await testers.remove(admin, user);
  assert.equal((await demoAccess(isolated, user)).tester, false);
  const audit = (await isolated.query("SELECT action FROM v2_audit_logs WHERE entity_type='DEMO_TESTER' AND entity_id=$1 ORDER BY created_at", [user])).rows;
  assert.deepEqual(audit.map(a => a.action), ["DEMO_TESTER_SAVED", "DEMO_TESTER_SAVED", "DEMO_TESTER_REMOVED"]);
});

test("demo code has no route to V2 points, rewards or vouchers", async () => {
  const dir = new URL("../src/bonusplay/", import.meta.url);
  for (const f of ["service.ts", "catalog.ts", "providers.ts", "admin-catalog.ts", "seed.ts", "session.ts"]) {
    const src = await readFile(new URL(f, dir), "utf8");
    assert.doesNotMatch(src, /v2_|\/v2\/|createPointsLedger|createRewardService/, f);
  }
});

test("users can export their data, without gift-card secrets", async () => {
  const user = await account();
  await ledger.execute({ kind: "adjust", accountId: user, amount: 300, fundingBudgetId: budget, actorId: admin,
    reason: "Velkomstbonus fra godkjent budsjett", idempotencyKey: randomUUID() });
  const data = await exportAccountData(isolated, user);
  assert.equal(data.account.id, user);
  assert.equal(data.pointsTransactions.length, 1);
  assert.equal(data.pointsTransactions[0].amount, 300);
  assert.ok(!JSON.stringify(data).includes("ciphertext"));
  await assert.rejects(exportAccountData(isolated, "missing"), denied(404));
});

test("a deletion request stops access immediately and keeps bookkeeping records", async () => {
  const user = await account();
  await ledger.execute({ kind: "adjust", accountId: user, amount: 50, fundingBudgetId: budget, actorId: admin,
    reason: "Velkomstbonus fra godkjent budsjett", idempotencyKey: randomUUID() });
  await requestDeletion(isolated, user);
  assert.equal((await isolated.query("SELECT status FROM v2_accounts WHERE id=$1", [user])).rows[0].status, "DELETION_REQUESTED");
  assert.equal((await isolated.query("SELECT count(*)::int n FROM v2_points_transactions WHERE account_id=$1", [user])).rows[0].n, 1);
  await assert.rejects(requestDeletion(isolated, user), denied(409));
  await assert.rejects(requestDeletion(isolated, admin), denied(409));
  assert.equal((await isolated.query("SELECT count(*)::int n FROM v2_audit_logs WHERE action='ACCOUNT_DELETION_REQUESTED' AND entity_id=$1", [user])).rows[0].n, 1);
});
