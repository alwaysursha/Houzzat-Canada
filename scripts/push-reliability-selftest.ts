/**
 * Push deep-link / tap navigation reliability (no Vitest harness in repo).
 * Run: pnpm push-reliability:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openLeadHandoffHref, openLeadProfileHref } from "../src/lib/agent/lead-profile-query";
import { sanitizePushHref } from "../src/lib/notifications/push-href";
import { resolveProPostSignInHref } from "../src/lib/auth/pro-sign-in-routing";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staffEvents = readFileSync(
  join(root, "src/lib/notifications/staff-events.ts"),
  "utf8",
);
const pushHrefFile = readFileSync(
  join(root, "src/lib/notifications/push-href.ts"),
  "utf8",
);
const proStartup = readFileSync(
  join(root, "src/components/mobile/ProWorkspaceBootstrap.tsx"),
  "utf8",
);

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
  // --- consumer + staff href sanitizer ---
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

  // Staff CRM deep-links (canonical query + handoff + legacy path) must pass.
  const leadHref = openLeadProfileHref("lead_abc");
  assert.equal(leadHref, "/agent/leads?lead=lead_abc");
  assert.equal(sanitizePushHref(leadHref), leadHref);
  const handoffHref = openLeadHandoffHref("lead_abc");
  assert.equal(handoffHref, "/agent/open-lead/lead_abc");
  assert.equal(sanitizePushHref(handoffHref), handoffHref);
  assert.equal(
    sanitizePushHref("/agent/leads/lead_abc"),
    "/agent/leads/lead_abc",
  );
  assert.equal(sanitizePushHref("/agent/tasks"), "/agent/tasks");
  assert.equal(sanitizePushHref("/admin/people"), "/admin/people");
  assert.equal(sanitizePushHref("/agent/leads"), "/agent/leads");

  // Path traversal still rejected.
  assert.equal(sanitizePushHref("/agent/../auth/sign-in"), null);

  // --- pending consume-once with staff query preserved ---
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
      href: leadHref,
      id: "msg-lead",
    }),
    leadHref,
  );
  assert.equal(pending.peekPendingPushNavigation()?.href, leadHref);
  assert.equal(pending.takePendingPushNavigation(), leadHref);
  assert.equal(pending.takePendingPushNavigation(), null);

  // --- auth callback preserves lead query ---
  assert.equal(
    resolveProPostSignInHref("/agent/leads?lead=lead_abc", "AGENT"),
    "/agent/leads?lead=lead_abc",
  );
  assert.equal(
    resolveProPostSignInHref("/agent/leads?lead=lead_abc", "ADMIN"),
    "/agent/leads?lead=lead_abc",
  );
  assert.equal(
    resolveProPostSignInHref("https://evil.com", "AGENT"),
    "/agent",
  );

  // --- structural: staff senders use handoff href helper ---
  assert.ok(staffEvents.includes("openLeadHandoffHref"));
  assert.ok(staffEvents.includes("href: openLeadHandoffHref(input.leadId)"));
  assert.ok(staffEvents.includes('type: "new_lead"'));
  assert.ok(staffEvents.includes('type: "lead_reassigned"'));
  assert.ok(staffEvents.includes('type: "task_due"'));
  assert.ok(
    staffEvents.includes('href: first.leadId ? openLeadHandoffHref(first.leadId) : "/agent/tasks"'),
  );
  assert.ok(
    pushHrefFile.includes('path.startsWith("/agent/")'),
    "sanitizer must allow HouzzatPro /agent paths",
  );
  assert.ok(
    proStartup.includes("peekPendingPushNavigation"),
    "Pro startup must honor pending push destination",
  );

  // --- Worker dispatch ownership (shape) ---
  const pushMod = await import("../src/lib/notifications/push");
  assert.equal(typeof pushMod.sendPushToUser, "function");
  assert.equal(typeof pushMod.sendPushToUsers, "function");
  assert.equal(typeof pushMod.sendPushToUserFirstEnabled, "function");
  const ret = pushMod.sendPushToUser(undefined, {
    type: "property_update",
    title: "t",
    body: "b",
  });
  assert.equal(ret, undefined);

  const pushSrc = readFileSync(
    join(root, "src/lib/notifications/push.ts"),
    "utf8",
  );
  assert.ok(
    pushSrc.includes("logPushDeliveryEnqueue"),
    "sendPushToUser must emit [push:delivery] enqueue",
  );
  assert.ok(
    pushSrc.includes("logPushDeliveryResult"),
    "deliverPushToUser must emit [push:delivery] result",
  );

  console.log("push-reliability-selftest: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
