import assert from "node:assert/strict";
import {
  authSessionLooksAuthenticated,
  collectAuthCookieNamesToClear,
} from "../src/lib/auth/logout-cookies";

function testCollectCookies() {
  const names = collectAuthCookieNamesToClear(
    "__Secure-authjs.session-token=abc; __Secure-authjs.session-token.0=c0; other=1",
  );
  assert.ok(names.includes("__Secure-authjs.session-token"));
  assert.ok(names.includes("__Secure-authjs.session-token.0"));
  assert.ok(names.includes("__Secure-authjs.session-token.1"));
  assert.ok(!names.includes("other"));
}

function testMinimalClearWithoutSession() {
  const names = collectAuthCookieNamesToClear("");
  assert.ok(names.includes("__Secure-authjs.session-token"));
  assert.equal(
    names.filter((n) => /\.\d+$/.test(n)).length,
    0,
    "must not pre-emit chunk cookies without a session",
  );
}

function testSessionShape() {
  assert.equal(authSessionLooksAuthenticated(null), false);
  assert.equal(authSessionLooksAuthenticated({}), false);
  assert.equal(authSessionLooksAuthenticated({ user: null }), false);
  assert.equal(
    authSessionLooksAuthenticated({ user: { email: "a@b.c" } }),
    true,
  );
}

testCollectCookies();
testMinimalClearWithoutSession();
testSessionShape();
console.log("logout-session-selftest: ok");
