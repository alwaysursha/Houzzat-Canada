/**
 * Open-lead runtime regression — cookie mutation context + handoff matrix.
 * Structural + pure-logic; no production DB writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  openLeadHandoffHref,
  openLeadProfileHref,
} from "../src/lib/agent/lead-profile-query";
import { shouldConfirmWorkspaceSwitch } from "../src/lib/open-lead-workspace-switch";
import { sanitizePushHref } from "../src/lib/notifications/push-href";
import { WS_A, WS_B } from "./lib/multi-workspace-isolation-fixtures";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOUZZAT = "cmt7kfcth0000gvu0bqsycsvz";

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

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** F — Server Component performs ZERO cookie mutation. */
function testPageHasNoCookieMutation() {
  const page = read("src/app/(agent)/agent/open-lead/[leadId]/page.tsx");
  assert.ok(!/\bcookies\s*\(/.test(page), "page must not call cookies()");
  assert.ok(!page.includes("signActiveWorkspaceId"));
  assert.ok(!page.includes("cookieStore"));
  assert.ok(!page.includes("ACTIVE_WORKSPACE_COOKIE"));
  assert.ok(page.includes("redirect(`/api/agent/open-lead/"));
  assert.ok(page.includes("cookieAlreadyCorrect"));
}

/** G — Cookie write only in Route Handler. */
function testCookieWriteOnlyInRouteHandler() {
  const api = read("src/app/api/agent/open-lead/[leadId]/route.ts");
  assert.ok(api.includes("export async function GET"));
  assert.ok(api.includes("export async function POST"));
  assert.ok(api.includes("response.cookies.set"));
  assert.ok(api.includes("signActiveWorkspaceId"));
  assert.ok(api.includes("withWorkspaceCookie"));
  // GET must not silently cross-switch
  assert.ok(api.includes("needsConfirm"));
  assert.ok(api.includes("isTrustedStaffMutationOrigin"));
}

/** A/B/C matrix via shouldConfirm + cookieAlreadyCorrect semantics. */
function testSameWorkspaceMatrix() {
  // A: single membership, no cookie → no confirm
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: HOUZZAT,
      cookieWorkspaceId: null,
      activeMemberWorkspaceIds: [HOUZZAT],
    }),
    false,
  );

  // B: single membership, valid cookie → no confirm
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: HOUZZAT,
      cookieWorkspaceId: HOUZZAT,
      activeMemberWorkspaceIds: [HOUZZAT],
    }),
    false,
  );

  // C: stale cookie, sole Houzzat → no confirm
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: HOUZZAT,
      cookieWorkspaceId: "stale_ws",
      activeMemberWorkspaceIds: [HOUZZAT],
    }),
    false,
  );

  // cookieAlreadyCorrect equivalent
  const validCookie = (cookie: string | null, members: string[]) =>
    cookie && members.includes(cookie) ? cookie : null;
  assert.equal(validCookie(null, [HOUZZAT]), null);
  assert.equal(validCookie(HOUZZAT, [HOUZZAT]), HOUZZAT);
  assert.equal(validCookie("stale_ws", [HOUZZAT]), null);
}

/** D: A+B membership, active A, Lead B → confirm */
function testCrossWorkspaceConfirm() {
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: WS_B,
      cookieWorkspaceId: WS_A,
      activeMemberWorkspaceIds: [WS_A, WS_B],
    }),
    true,
  );
}

/** E: A-only, Lead B → membership gate (confirm false; caller 404s) */
function testForeignLeadNotConfirm() {
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: WS_B,
      cookieWorkspaceId: WS_A,
      activeMemberWorkspaceIds: [WS_A],
    }),
    false,
  );
}

/** H: sanitizer accepts open-lead href */
function testSanitizerAcceptsOpenLead() {
  const leadId = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
  const href = openLeadHandoffHref(leadId);
  assert.equal(href, `/agent/open-lead/${leadId}`);
  assert.equal(sanitizePushHref(href), href);
  assert.equal(sanitizePushHref(`/agent/leads?lead=${leadId}`), `/agent/leads?lead=${leadId}`);
  assert.equal(openLeadProfileHref(leadId), `/agent/leads?lead=${leadId}`);
}

/** I: cold-start pending href survives stash → peek → take */
async function testPendingNavSurvives() {
  const pending = await import("../src/lib/notifications/pending-push-nav");
  pending.__resetPendingPushNavigationForTests();
  const href = openLeadHandoffHref("lead_cold_start_1");
  const stored = pending.stashPendingPushNavigation({ href, id: "msg-1" });
  assert.equal(stored, href);
  const peeked = pending.peekPendingPushNavigation();
  assert.equal(peeked?.href, href);
  const taken = pending.takePendingPushNavigation();
  assert.equal(taken, href);
  assert.equal(pending.takePendingPushNavigation(), null);
  pending.__resetPendingPushNavigationForTests();
}

function testHandoffHelperExists() {
  const helper = read("src/lib/open-lead-handoff.ts");
  assert.ok(helper.includes("resolveOpenLeadHandoff"));
  assert.ok(helper.includes("cookieAlreadyCorrect"));
  assert.ok(helper.includes("needsConfirm"));
  assert.ok(!helper.includes("cookies().set"));
}

async function main() {
  testPageHasNoCookieMutation();
  testCookieWriteOnlyInRouteHandler();
  testSameWorkspaceMatrix();
  testCrossWorkspaceConfirm();
  testForeignLeadNotConfirm();
  testSanitizerAcceptsOpenLead();
  await testPendingNavSurvives();
  testHandoffHelperExists();
  console.log("open-lead-runtime:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
