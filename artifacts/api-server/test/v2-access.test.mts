import test from "node:test";
import assert from "node:assert/strict";
import { canAccess, isSafeMutation } from "../src/v2/access-policy.ts";

test("only explicit administrator membership grants access", () => {
  for (const role of ["USER", "PARTNER", "user", "admin", "demo-admin", "UNKNOWN"]) {
    assert.equal(canAccess(role, "ACTIVE", ["ADMIN", "SUPER_ADMIN"]), false);
  }
  assert.equal(canAccess("ADMIN", "ACTIVE", ["ADMIN", "SUPER_ADMIN"]), true);
  assert.equal(canAccess("SUPER_ADMIN", "ACTIVE", ["ADMIN", "SUPER_ADMIN"]), true);
});
test("partner scope is not inherited from administrator role", () => {
  assert.equal(canAccess("PARTNER", "ACTIVE", ["PARTNER"]), true);
  assert.equal(canAccess("USER", "ACTIVE", ["PARTNER"]), false);
  assert.equal(canAccess("ADMIN", "ACTIVE", ["PARTNER"]), false);
});
test("suspended and deletion-requested accounts have no sensitive access", () => {
  for (const role of ["USER", "PARTNER", "ADMIN", "SUPER_ADMIN"]) {
    for (const status of ["SUSPENDED", "DELETION_REQUESTED", "", "INVALID"]) {
      assert.equal(canAccess(role, status, ["USER", "PARTNER", "ADMIN", "SUPER_ADMIN"]), false);
    }
  }
});
test("same-origin CSRF policy fails closed", () => {
  assert.equal(isSafeMutation({ host: "app.example", origin: "https://app.example" }), true);
  assert.equal(isSafeMutation({ host: "localhost:80", origin: "http://localhost:80" }), true);
  for (const origin of [undefined, "", "null", "https://evil.example", "https://app.example.evil", "file://app.example"]) {
    assert.equal(isSafeMutation({ host: "app.example", origin }), false);
  }
  assert.equal(isSafeMutation({ host: "app.example", origin: "https://app.example", fetchSite: "cross-site" }), false);
});
import { adminMfaStatus, mfaEnforced } from "../src/v2/access-policy.ts";

test("administrator access requires a verified second factor", () => {
  for (const age of [null, undefined, [1, -1], [5, Number.NaN]] as const) {
    assert.equal(adminMfaStatus(age as never, { enforce: true }), "mfa_required");
  }
  assert.equal(adminMfaStatus([1, 600], { enforce: true }), "ok");
  assert.equal(adminMfaStatus([1, 0], { enforce: true }), "ok");
});
test("high-risk confirmation requires a recent second factor", () => {
  assert.equal(adminMfaStatus([1, 3], { enforce: true, strict: true }), "ok");
  assert.equal(adminMfaStatus([1, 11], { enforce: true, strict: true }), "reverify");
  assert.equal(adminMfaStatus([1, -1], { enforce: true, strict: true }), "mfa_required");
});
test("MFA can only be disabled explicitly outside production", () => {
  assert.equal(mfaEnforced({}), true);
  assert.equal(mfaEnforced({ V2_ADMIN_MFA: "off", NODE_ENV: "production" }), true);
  assert.equal(mfaEnforced({ V2_ADMIN_MFA: "off", NODE_ENV: "development" }), false);
  assert.equal(mfaEnforced({ V2_ADMIN_MFA: "OFF", NODE_ENV: "development" }), true);
});
