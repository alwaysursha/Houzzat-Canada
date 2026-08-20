/**
 * Focused Phase 3B push reliability checks (no Vitest harness in repo).
 * Run: pnpm exec tsx scripts/push-reliability-selftest.ts
 */

import assert from "node:assert/strict";
import { sanitizePushHref } from "../src/lib/notifications/push-href";

const memory = new Map<string, string>();

(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => {
    memory.set(k, String(v));
  },
  removeItem: (k) => {
    memory.delete(k);
  },
  clear: () => memory.clear(),
  key: () => null,
  get length() {
    return memory.size;
  },
};

async function main() {
  // --- href sanitizer ---
  assert.equal(sanitizePushHref("https://evil.com/x"), null);
  assert.equal(sanitizePushHref("//evil.com/x"), null);
  assert.equal(sanitizePushHref("javascript:alert(1)"), null);
  assert.equal(sanitizePushHref("data:text/html,hi"), null);
  assert.equal(sanitizePushHref("/listing/../admin"), null);
  assert.equal(sanitizePushHref("listing/N1"), null);
  assert.equal(sanitizePushHref(""), null);
  assert.equal(sanitizePushHref(null), null);
  assert.equal(sanitizePushHref("/listing/N123"), "/listing/N123");
  assert.equal(
    sanitizePushHref("/listing/36-norman/N13694248?x=1"),
    "/listing/36-norman/N13694248?x=1",
  );
  assert.equal(sanitizePushHref("/account/notifications"), "/account/notifications");
  assert.equal(sanitizePushHref("/search?q=1"), "/search?q=1");
  assert.equal(sanitizePushHref("/share/homes/abc"), "/share/homes/abc");
  assert.equal(sanitizePushHref("/agent/leads/1"), null);

  // --- pending consume-once ---
  const pending = await import("../src/lib/notifications/pending-push-nav");
  pending.__resetPendingPushNavigationForTests();

  assert.equal(
    pending.stashPendingPushNavigation({
      href: "javascript:alert(1)",
      id: "m1",
    }),
    null,
  );

  assert.equal(
    pending.stashPendingPushNavigation({
      href: "/account/notifications",
      id: "msg-1",
    }),
    "/account/notifications",
  );
  assert.equal(pending.takePendingPushNavigation(), "/account/notifications");
  assert.equal(pending.takePendingPushNavigation(), null, "second take empty");

  // Replay same id rejected
  assert.equal(
    pending.stashPendingPushNavigation({
      href: "/account/saved",
      id: "msg-1",
    }),
    null,
  );

  assert.equal(
    pending.stashPendingPushNavigation({
      href: "/listing/N9",
      id: "msg-2",
    }),
    "/listing/N9",
  );
  assert.equal(pending.peekPendingPushNavigation()?.href, "/listing/N9");
  assert.equal(pending.takePendingPushNavigation(), "/listing/N9");

  // --- Worker dispatch ownership (shape) ---
  const pushMod = await import("../src/lib/notifications/push");
  assert.equal(typeof pushMod.sendPushToUser, "function");
  assert.equal(typeof pushMod.sendPushToUsers, "function");
  assert.equal(typeof pushMod.sendPushToUserFirstEnabled, "function");
  // Returns void (enqueue), not a Promise
  const ret = pushMod.sendPushToUser(undefined, {
    type: "property_update",
    title: "t",
    body: "b",
  });
  assert.equal(ret, undefined);

  console.log("push-reliability-selftest: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
