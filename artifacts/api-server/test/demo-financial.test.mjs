import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Development gateway only: never run financial test mutations against a published site.
const base = "http://localhost:80";
async function demo() {
  const res = await fetch(`${base}/api/bonusplay/demo-session`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "user" }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.getSetCookie().find(c => c.startsWith("bonusplay_demo="))?.split(";")[0];
  assert.ok(cookie);
  return async (path, body, method = body ? "POST" : "GET") => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
}

test("demo ledger reward retries do not duplicate credits", async () => {
  const call = await demo();
  const before = (await call("/api/bonusplay/state")).body;
  const key = randomUUID();
  const one = await call("/api/bonusplay/claims", { activityId: "mission-ad", idempotencyKey: key });
  const two = await call("/api/bonusplay/claims", { activityId: "mission-ad", idempotencyKey: key });
  assert.equal(one.status, 200);
  assert.equal(two.status, 200);
  assert.equal(two.body.state.user.points, one.body.state.user.points);
  assert.ok(one.body.state.user.points > before.user.points);
  assert.equal(two.body.state.transactions.filter(t => t.title === "Se en video" && t.currency === "points").length, 1);
});

test("simultaneous redemptions cannot overdraw; retry debits only once", async () => {
  const call = await demo();
  const start = (await call("/api/bonusplay/state")).body.user.points;
  assert.equal(start, 12450);
  const firstKey = randomUUID(), secondKey = randomUUID();
  const results = await Promise.all([
    call("/api/bonusplay/redemptions", { rewardId: "giftcard-100", idempotencyKey: firstKey }),
    call("/api/bonusplay/redemptions", { rewardId: "giftcard-100", idempotencyKey: secondKey }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const key = results[0].status === 201 ? firstKey : secondKey;
  const retry = await call("/api/bonusplay/redemptions", { rewardId: "giftcard-100", idempotencyKey: key });
  assert.equal(retry.status, 201);
  const state = (await call("/api/bonusplay/state")).body;
  assert.equal(state.user.points, 2450);
  assert.equal(state.redemptions.length, 1);
  const insufficient = await call("/api/bonusplay/redemptions", { rewardId: "giftcard-250", idempotencyKey: randomUUID() });
  assert.equal(insufficient.status, 409);
});

test("demo identity never authorizes V2; user cannot access demo admin", async () => {
  const call = await demo();
  assert.equal((await call("/api/v2/me")).status, 401);
  assert.equal((await call("/api/v2/admin/access")).status, 401);
  assert.equal((await call("/api/v2/partner/access")).status, 401);
  assert.equal((await call("/api/bonusplay/admin")).status, 401);
  assert.equal((await call("/api/v2/enroll", {}, "POST")).status, 401);
});
