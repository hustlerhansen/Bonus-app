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
