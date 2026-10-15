/**
 * Push deep-link / tap navigation reliability (no Vitest harness in repo).
 * Run: pnpm push-reliability:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openLeadHandoffHref, openLeadProfileHref } from "../src/lib/agent/lead-profile-query";
import { chatsPageHref } from "../src/lib/agent/chats-inbox-query";
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
const authController = readFileSync(
  join(root, "src/lib/mobile/pro-native-auth-controller.ts"),
  "utf8",
);
const hardSignOut = readFileSync(
  join(root, "src/lib/auth/hard-sign-out.ts"),
  "utf8",
);
const pushClient = readFileSync(
  join(root, "src/lib/notifications/push-client.ts"),
  "utf8",
);
const handoffRoute = readFileSync(
  join(root, "src/app/api/mobile/workspace-handoff/route.ts"),
  "utf8",
);

const memory = new Map<string, string>();

type Loc = { hostname: string; pathname: string };
const loc: Loc = {
  hostname: "tenant.houzzatpro.com",
  pathname: "/agent",
};

(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { location: Loc }).location = loc;
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
  const chatHref = chatsPageHref("lead_abc");
  assert.equal(chatHref, "/agent/chats?lead=lead_abc");
  assert.equal(sanitizePushHref(chatHref), chatHref);

  // Path traversal still rejected.
  assert.equal(sanitizePushHref("/agent/../auth/sign-in"), null);

  // --- pending consume-once with staff query preserved ---
  const pending = await import("../src/lib/notifications/pending-push-nav");
  pending.__resetPendingPushNavigationForTests();
  pending.__disablePendingPushNavPreferencesForTests();

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

  // --- Preferences survive simulated cross-origin handoff ---
  pending.__resetPendingPushNavigationForTests();
  pending.__enablePendingPushNavPreferencesForTests();
  const coldChat = chatsPageHref("lead_cold");
  assert.equal(
    pending.stashPendingPushNavigation({ href: coldChat, id: "cold-chat" }),
    coldChat,
  );
  pending.bindPendingPushNavigationUser("user_a");
  // Simulate platform→tenant: wipe origin sessionStorage only.
  memory.clear();
  assert.equal(pending.peekPendingPushNavigation(), null);
  await pending.hydratePendingPushNavigation();
  assert.equal(pending.peekPendingPushNavigation()?.href, coldChat);
  assert.equal(
    await pending.takePendingPushNavigationForTenantLanding({
      expectedUserId: "user_a",
    }),
    coldChat,
  );
  assert.equal(pending.peekPendingPushNavigation(), null);

  // Cold-start lead + task destinations
  for (const [id, href] of [
    ["cold-lead", openLeadHandoffHref("lead_x")],
    ["cold-task", "/agent/tasks"],
  ] as const) {
    pending.__resetPendingPushNavigationForTests();
    pending.__enablePendingPushNavPreferencesForTests();
    assert.equal(
      pending.stashPendingPushNavigation({ href, id }),
      href,
    );
    memory.clear();
    await pending.hydratePendingPushNavigation();
    assert.equal(
      await pending.takePendingPushNavigationForTenantLanding(),
      href,
    );
  }

  // Bound user mismatch clears pending
  pending.__resetPendingPushNavigationForTests();
  pending.__enablePendingPushNavPreferencesForTests();
  assert.equal(
    pending.stashPendingPushNavigation({
      href: coldChat,
      id: "bound-mismatch",
      userId: "user_a",
    }),
    coldChat,
  );
  assert.equal(
    pending.takePendingPushNavigation({ expectedUserId: "user_b" }),
    null,
  );
  assert.equal(pending.peekPendingPushNavigation(), null);

  // Logout clear
  pending.__resetPendingPushNavigationForTests();
  pending.__enablePendingPushNavPreferencesForTests();
  pending.stashPendingPushNavigation({ href: coldChat, id: "logout-clear" });
  pending.clearPendingPushNavigation();
  memory.clear();
  await pending.hydratePendingPushNavigation();
  assert.equal(pending.peekPendingPushNavigation(), null);

  // Defer on bootstrap host / /pro/* ; allow on tenant CRM
  loc.hostname = "app.houzzatpro.com";
  loc.pathname = "/pro/sign-in";
  assert.equal(pending.shouldDeferPushNavigationConsume(), true);
  loc.pathname = "/pro/mobile/handoff";
  loc.hostname = "tenant.houzzatpro.com";
  assert.equal(pending.shouldDeferPushNavigationConsume(), true);
  loc.pathname = "/agent";
  loc.hostname = "tenant.houzzatpro.com";
  assert.equal(pending.shouldDeferPushNavigationConsume(), false);
  loc.pathname = "/agent/chats";
  assert.equal(pending.shouldDeferPushNavigationConsume(), false);

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

  // --- structural: staff senders + Pro restore path ---
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
    proStartup.includes("takePendingPushNavigationForTenantLanding"),
    "Pro startup must restore pending push after tenant-ready",
  );
  assert.ok(
    authController.includes("takePendingPushNavigationForTenantLanding"),
    "Handoff exchange must restore pending push over Launchpad default",
  );
  assert.ok(
    pushClient.includes("shouldDeferPushNavigationConsume"),
    "Tap handler must defer on Pro bootstrap",
  );
  assert.ok(
    hardSignOut.includes("clearPendingPushNavigation"),
    "Logout must clear pending push destinations",
  );
  assert.ok(
    handoffRoute.includes("userId: peeked.userId"),
    "Handoff exchange exposes userId for pending binding checks",
  );

  // No pending → Launchpad default path still present
  assert.ok(authController.includes("finalizeStaffStartupDestination"));
  assert.ok(proStartup.includes("resolveHouzzatProPrivateStartupDestination"));

  // --- Worker dispatch ownership (shape) ---
  const pushMod = await import("../src/lib/notifications/push");
  assert.equal(typeof pushMod.sendPushToUser, "function");
  assert.equal(typeof pushMod.sendPushToUsers, "function");
  assert.equal(typeof pushMod.sendPushToUserFirstEnabled, "function");
  assert.equal(typeof pushMod.deliverPushToUsersNow, "function");
  const ret = pushMod.sendPushToUser(undefined, {
    type: "property_update",
    title: "t",
    body: "b",
  });
  assert.equal(ret, undefined);

  pending.__disablePendingPushNavPreferencesForTests();
  pending.__resetPendingPushNavigationForTests();

  console.log("push-reliability-selftest: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
