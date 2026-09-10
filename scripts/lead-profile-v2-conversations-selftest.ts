/**
 * Lead Profile V2 Conversations tab selftest.
 * Run: node --import tsx scripts/lead-profile-v2-conversations-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canAccessLead } from "../src/lib/crm-read-scope";
import { v2CanAccessLead } from "../src/lib/agent/lead-profile-v2/access";
import {
  createLeadProfileV2Session,
  isV2AbortError,
} from "../src/lib/agent/lead-profile-v2/request-gate";
import { V2_EMAIL_LIST_SELECT } from "../src/lib/agent/lead-profile-v2/load-emails";
import {
  V2_EMAILS_PAGE_MAX,
  V2_EMAILS_PAGE_SIZE,
  V2_EMAILS_RESOURCE_KEY,
  canApplyV2EmailsResponse,
  mergeV2Emails,
  parseV2EmailsSearchParams,
  shouldSkipDuplicateV2EmailsAppend,
  v2EmailsAppendCursorKey,
  v2EmailsPageTake,
} from "../src/lib/agent/lead-profile-v2/emails-query";
import type { LeadProfileV2Email } from "../src/lib/agent/lead-profile-v2/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/components/agent/LeadEmailForm.tsx",
  "src/components/agent/EmailPreviewModal.tsx",
  "src/app/api/agent/leads/[id]/summary/route.ts",
  "src/app/api/agent/leads/[id]/emails/route.ts",
  "src/app/api/agent/email/route.ts",
  "src/app/api/agent/emails/[id]/route.ts",
  "src/lib/agent/lead-profile-panels.ts",
  "src/lib/agent/customer-timeline.ts",
];

const V2_CONVERSATIONS_FILES = [
  "src/app/api/agent/leads-v2/[id]/emails/route.ts",
  "src/lib/agent/lead-profile-v2/load-emails.ts",
  "src/lib/agent/lead-profile-v2/emails-query.ts",
  "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Emails.ts",
];

function testLegacyUntouchedByV2Imports() {
  for (const rel of LEGACY_FILES) {
    const src = read(rel);
    assert.equal(
      src.includes("lead-profile-v2"),
      false,
      `${rel} must not import V2`,
    );
    assert.equal(
      src.includes("leads-v2"),
      false,
      `${rel} must not reference V2 routes`,
    );
  }
}

function testForeignWorkspaceEmailsUnavailable() {
  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  try {
    process.env.WORKSPACE_READ_SCOPE = "workspace";
    process.env.TENANT_DOMAIN_SCOPE = "workspace";
    const ctx = {
      user: { id: "agent-a" },
      organizationId: "org-a",
      organizationIds: ["org-a"],
      canSeeTeamLeads: true,
      isPlatformAdmin: false,
      workspaceId: "ws-a",
      isWorkspaceMember: true,
      isWorkspaceCrmAllowed: true,
      hasAmbiguousWorkspaceMembership: false,
    };
    const foreign = {
      organizationId: "org-b",
      workspaceId: "ws-b",
      assignedAgentId: "agent-a",
    };
    assert.equal(canAccessLead(ctx, foreign), false);
    assert.equal(v2CanAccessLead(ctx, foreign), false);
    const loader = read("src/lib/agent/lead-profile-v2/load-emails.ts");
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) < loader.indexOf("prisma.leadEmailLog.findMany"),
    );
    assert.ok(loader.includes("leadId: lead.id"));
    const route = read("src/app/api/agent/leads-v2/[id]/emails/route.ts");
    assert.ok(route.includes("handleAgentLeadGet"));
    assert.equal(route.includes("searchParams.get(\"workspace"), false);
    assert.equal(route.includes("/summary"), false);
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

function testPaginationMatchesLegacy() {
  assert.equal(V2_EMAILS_PAGE_SIZE, 20);
  assert.equal(V2_EMAILS_PAGE_MAX, 40);
  assert.equal(v2EmailsPageTake(), 20);
  assert.equal(v2EmailsPageTake(99), 40);
  const legacy = read("src/lib/agent/lead-profile-panels.ts");
  const loader = read("src/lib/agent/lead-profile-v2/load-emails.ts");
  const query = read("src/lib/agent/lead-profile-v2/emails-query.ts");
  assert.ok(legacy.includes("input?.take ?? 20"));
  assert.ok(legacy.includes("take: take + 1"));
  assert.ok(legacy.includes("createdAt: { lt: input.before }"));
  assert.ok(loader.includes("take: take + 1"));
  assert.ok(loader.includes("createdAt: { lt: input.before }"));
  assert.ok(loader.includes('orderBy: { createdAt: "desc" }'));
  assert.equal(query.includes("searchParams.get(\"take\")"), false);
  const parsed = parseV2EmailsSearchParams(
    new URL(
      "https://x.local/api/agent/leads-v2/lead-1/emails?before=2026-01-01T00:00:00.000Z",
    ),
  );
  assert.equal(parsed.before?.toISOString(), "2026-01-01T00:00:00.000Z");
  const invalid = parseV2EmailsSearchParams(
    new URL("https://x.local/api/agent/leads-v2/lead-1/emails?before=nope"),
  );
  assert.equal(invalid.before, null);
}

function testHtmlBodyAndBodyOmitted() {
  const select = V2_EMAIL_LIST_SELECT as Record<string, unknown>;
  assert.equal("htmlBody" in select, false);
  assert.equal("body" in select, false);
  assert.equal("attachments" in select, false);
  assert.deepEqual(Object.keys(select), [
    "id",
    "subject",
    "toEmail",
    "kind",
    "openedAt",
    "clickedAt",
    "openCount",
    "clickCount",
    "createdAt",
  ]);
  const loader = read("src/lib/agent/lead-profile-v2/load-emails.ts");
  assert.equal(loader.includes("htmlBody:"), false);
  assert.equal(loader.includes("body: true"), false);
  const dto = read("src/lib/agent/lead-profile-v2/types.ts");
  const emailType =
    dto.split("export type LeadProfileV2Email")[1]?.split(
      "export type LeadProfileV2EmailsPanel",
    )[0] ?? "";
  assert.equal(emailType.includes("htmlBody"), false);
  assert.equal(emailType.includes("body:"), false);
  for (const rel of V2_CONVERSATIONS_FILES) {
    if (rel.endsWith("load-emails.ts")) continue;
    const src = read(rel);
    assert.equal(src.includes("htmlBody"), false, `${rel} must not mention htmlBody`);
    assert.equal(src.includes("e.body"), false);
  }
}

function testNoUnrelatedProfileQueries() {
  const loader = read("src/lib/agent/lead-profile-v2/load-emails.ts");
  for (const banned of [
    "loadPagedLeadTimeline",
    "prisma.agentTask",
    "prisma.followUpNote",
    "prisma.appointment",
    "hotness",
    "engagement",
    "listingHistory",
    "/summary",
  ]) {
    assert.equal(loader.includes(banned), false, `emails loader must not query ${banned}`);
  }
}

function testPreviewRemainsSeparate() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  );
  const loader = read("src/lib/agent/lead-profile-v2/load-emails.ts");
  const preview = read("src/components/agent/EmailPreviewModal.tsx");
  const previewRoute = read("src/app/api/agent/emails/[id]/route.ts");
  assert.ok(panel.includes("EmailPreviewModal"));
  assert.ok(panel.includes("setPreviewEmailId(e.id)"));
  assert.equal(panel.includes("/api/agent/emails/"), false);
  assert.equal(loader.includes("htmlBody:"), false);
  assert.ok(loader.includes("Preview is a separate"));
  assert.ok(preview.includes("/api/agent/emails/${emailId}"));
  assert.ok(previewRoute.includes("htmlBody: true"));
  assert.ok(previewRoute.includes("canAccessLead(ctx, email.lead)"));
}

function testDuplicateLoadMorePrevented() {
  const cursorKey = v2EmailsAppendCursorKey({
    leadId: "lead-a",
    before: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(
    shouldSkipDuplicateV2EmailsAppend({
      inFlight: true,
      lastCursorKey: null,
      cursorKey,
    }),
    true,
  );
  assert.equal(
    shouldSkipDuplicateV2EmailsAppend({
      inFlight: false,
      lastCursorKey: cursorKey,
      cursorKey,
    }),
    true,
  );
  assert.equal(
    shouldSkipDuplicateV2EmailsAppend({
      inFlight: false,
      lastCursorKey: null,
      cursorKey,
    }),
    false,
  );
  const prev: LeadProfileV2Email[] = [
    {
      id: "a",
      subject: "Hi",
      toEmail: "a@x.com",
      kind: "agent_message",
      openedAt: null,
      clickedAt: null,
      openCount: 0,
      clickCount: 0,
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  const next: LeadProfileV2Email[] = [
    prev[0]!,
    {
      ...prev[0]!,
      id: "b",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  assert.deepEqual(
    mergeV2Emails(prev, next, true).map((row) => row.id),
    ["a", "b"],
  );
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Emails.ts",
  );
  assert.ok(hook.includes("shouldSkipDuplicateV2EmailsAppend"));
  assert.ok(hook.includes("requestIfIdle"));
}

function testStaleCannotAppend() {
  assert.equal(
    canApplyV2EmailsResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2EmailsResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2EmailsResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Emails.ts",
  );
  assert.ok(hook.includes("input.append"));
  assert.ok(hook.includes("mergeV2Emails"));
}

function testAbortNotError() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Emails.ts",
  );
  assert.ok(hook.includes("isV2AbortError"));
  assert.ok(hook.includes("signal.aborted"));
  assert.equal(
    isV2AbortError(Object.assign(new Error("Aborted"), { name: "AbortError" })),
    true,
  );
}

function testNoRetry() {
  const fetchSrc = read("src/lib/agent/lead-profile-v2/fetch-json.ts");
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Emails.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testSendRefreshTargeted() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const helper = read(
    "src/lib/agent/lead-profile-v2/conversations-email-refresh-query.ts",
  );
  const sent =
    host.split("const onEmailSent")[1]?.split("const onMatchboardUpdated")[0] ??
    "";
  assert.ok(sent.includes("applyV2ConversationsEmailSentRefresh"));
  assert.ok(sent.includes("reloadEmails"));
  assert.ok(sent.includes("reloadTimeline: reloadDefaultTimeline"));
  assert.ok(sent.includes("reloadRail"));
  assert.ok(sent.includes("reloadEngagementOverview"));
  assert.ok(sent.includes("invalidateEngagementOverview"));
  assert.ok(sent.includes("tab"));
  assert.equal(sent.includes("reloadSavedSearches"), false);
  assert.equal(sent.includes("reloadSavedHomes"), false);
  assert.equal(sent.includes("reload()"), false);
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  );
  assert.ok(panel.includes("onUpdated={onEmailSent}"));
  assert.ok(panel.includes('from "@/components/agent/LeadEmailForm"'));
  const form = read("src/components/agent/LeadEmailForm.tsx");
  assert.ok(form.includes('fetch("/api/agent/email"'));
  assert.ok(form.includes('mode: "single"'));
  assert.equal(host.includes("/summary"), false);
  const applyFn =
    helper.split("export function applyV2ConversationsEmailSentRefresh")[1] ??
    "";
  assert.ok(applyFn.includes("reloadEmails()"));
  assert.ok(applyFn.includes("reloadTimeline()"));
  assert.ok(applyFn.includes("reloadRail()"));
  assert.ok(applyFn.includes("reloadEngagementOverview()"));
  assert.ok(applyFn.includes("invalidateEngagementOverview()"));
}

function testConsentPreserved() {
  const form = read("src/components/agent/LeadEmailForm.tsx");
  assert.ok(form.includes("disabled={pending || !consented || !defaultTo}"));
  assert.ok(form.includes('consented ? "CASL ok" : "No consent"'));
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  );
  assert.ok(panel.includes("consented={consented}"));
  assert.ok(panel.includes("defaultTo={defaultTo}"));
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(host.includes("consented={data.permissions.consented}"));
}

function testMutationAndPreviewProtectAccess() {
  const send = read("src/app/api/agent/email/route.ts");
  const preview = read("src/app/api/agent/emails/[id]/route.ts");
  assert.ok(send.includes("canAccessLead(ctx, lead)"));
  assert.ok(send.includes("no CASL consent"));
  assert.ok(preview.includes("canAccessLead(ctx, email.lead)"));
}

function testLazyLoad() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Emails.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(hook.includes("session.abort(V2_EMAILS_RESOURCE_KEY)"));
  assert.ok(host.includes('tab === "conversations"'));
  assert.ok(host.includes("useLeadProfileV2Emails("));
}

function testPresentationParity() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    "Send email",
    "No emails logged yet.",
    "Loading…",
    "Failed to load",
    "Not opened yet",
    "Opened",
    "Clicked",
    "Preview",
    "Load more",
    "To {e.toEmail}",
  ]) {
    assert.ok(panel.includes(copy), `missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
}

function testFailedConversationsIsolated() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Emails.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("setError(true)"));
  assert.ok(host.includes("emails.error"));
  assert.equal(hook.includes("setData("), false);
  assert.equal(hook.includes("reloadDefaultTimeline"), false);
}

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await waitMs(5);
  }
}

async function testDuplicateRequestsPrevented() {
  const session = createLeadProfileV2Session();
  let starts = 0;
  const fetchEmails = async () => {
    starts += 1;
    await waitMs(40);
  };
  session.request(V2_EMAILS_RESOURCE_KEY, "lead-a", fetchEmails);
  assert.equal(
    session.requestIfIdle(V2_EMAILS_RESOURCE_KEY, "lead-a", fetchEmails),
    false,
  );
  assert.equal(starts, 1);
  session.request("shell", "lead-a", fetchEmails);
  session.request("timeline", "lead-a", fetchEmails);
  assert.equal(session.inspect("shell").inFlight, true);
  assert.equal(session.inspect(V2_EMAILS_RESOURCE_KEY).inFlight, true);
  await waitUntil(
    () =>
      !session.inspect(V2_EMAILS_RESOURCE_KEY).inFlight &&
      !session.inspect("shell").inFlight &&
      !session.inspect("timeline").inFlight,
  );
}

async function testAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchEmails = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };

  session.request(V2_EMAILS_RESOURCE_KEY, "lead-a", fetchEmails);
  session.request(V2_EMAILS_RESOURCE_KEY, "lead-b", fetchEmails);
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(() => !session.inspect(V2_EMAILS_RESOURCE_KEY).inFlight);
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceEmailsUnavailable();
  testPaginationMatchesLegacy();
  testHtmlBodyAndBodyOmitted();
  testNoUnrelatedProfileQueries();
  testPreviewRemainsSeparate();
  testDuplicateLoadMorePrevented();
  testStaleCannotAppend();
  testAbortNotError();
  testNoRetry();
  testSendRefreshTargeted();
  testConsentPreserved();
  testMutationAndPreviewProtectAccess();
  testLazyLoad();
  testPresentationParity();
  testFailedConversationsIsolated();
  await testDuplicateRequestsPrevented();
  await testAbortOnLeadChange();
  console.log("lead-profile-v2-conversations-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
