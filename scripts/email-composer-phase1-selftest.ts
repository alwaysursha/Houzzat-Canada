/**
 * Phase 1 — floating Gmail-style CRM email composer selftest.
 * Run: pnpm email-composer-phase1:selftest
 *
 * Hermetic. No DB. No real sends.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyEmailComposerSendCompletion,
  beginEmailComposerSend,
  confirmDiscardEmailComposer,
  createEmailComposerSendSnapshot,
  createEmptyEmailComposerStore,
  emailComposerSendInProgress,
  finishEmailComposerSendBlocked,
  finishEmailComposerSendSuccess,
  getActiveEmailComposerDraft,
  maximizeEmailComposer,
  minimizeEmailComposer,
  onEmailComposerHostLeadChange,
  openEmailComposer,
  patchActiveEmailComposerDraft,
  requestCloseEmailComposer,
  restoreEmailComposer,
  shouldRefreshHostAfterEmailSend,
} from "../src/lib/agent/email-composer/composer-state";
import {
  canSubmitEmailComposer,
  interpretAgentEmailSendResponse,
  isEmailComposerDraftDirty,
} from "../src/lib/agent/email-composer/send-result";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function openLeadA(store = createEmptyEmailComposerStore()) {
  return openEmailComposer(store, {
    leadId: "lead-a",
    toEmail: "a@example.com",
    consented: true,
    recipientName: "Ada",
  });
}

function testRailOpensComposer() {
  const rail = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(rail.includes("onComposeEmail"));
  assert.ok(rail.includes("onClick: () => onComposeEmail()"));
  // Contact-row mailto for requesting email updates may remain; Email action must not.
  const emailActions = rail.split('label: "Email"').slice(1);
  assert.ok(emailActions.length >= 2);
  for (const block of emailActions) {
    const action = block.split("},")[0] ?? "";
    assert.ok(action.includes("onComposeEmail"), "Email quick action must open composer");
    assert.equal(action.includes("mailto:"), false);
    assert.equal(action.includes("href:"), false);
  }
  assert.ok(host.includes("onComposeEmail={onComposeEmail}"));
  assert.ok(host.includes("openComposer({"));
  assert.ok(host.includes("leadId,"));
  assert.ok(host.includes("toEmail: data.lead.customer?.email"));
}

function testConversationsOpensSameComposer() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(panel.includes("Compose an email"));
  assert.ok(panel.includes("onClick={onComposeEmail}"));
  assert.equal(panel.includes("LeadEmailForm"), false);
  assert.ok(host.includes("EmailComposerProvider"));
  assert.ok(host.includes("<EmailComposerShell"));
  assert.equal(host.includes("<LeadEmailForm"), false);
  // Single shared open path for rail + conversations.
  assert.equal(host.split("openComposer({").length - 1, 1);
}

function testMinimizeMaximizeRestore() {
  let store = openLeadA();
  store = patchActiveEmailComposerDraft(store, {
    subject: "Hello",
    body: "Body text",
  });
  store = minimizeEmailComposer(store);
  assert.equal(store.windowState, "minimized");
  assert.equal(getActiveEmailComposerDraft(store)?.subject, "Hello");
  assert.equal(getActiveEmailComposerDraft(store)?.body, "Body text");

  store = restoreEmailComposer(store);
  assert.equal(store.windowState, "open");
  assert.equal(getActiveEmailComposerDraft(store)?.subject, "Hello");

  store = maximizeEmailComposer(store);
  assert.equal(store.windowState, "maximized");
  store = maximizeEmailComposer(store);
  assert.equal(store.windowState, "open");
}

function testLeadSwitchSafety() {
  let store = openLeadA();
  store = patchActiveEmailComposerDraft(store, {
    subject: "For A",
    body: "Keep me",
  });
  store = onEmailComposerHostLeadChange(store, "lead-b");
  assert.equal(store.windowState, "closed");
  assert.equal(store.activeLeadId, null);
  // Prior lead draft retained in memory; not shown for the new host lead.
  assert.equal(store.draftsByLeadId["lead-a"]?.subject, "For A");
  assert.equal(store.draftsByLeadId["lead-b"], undefined);

  store = openEmailComposer(store, {
    leadId: "lead-b",
    toEmail: "b@example.com",
    consented: true,
  });
  assert.equal(store.activeLeadId, "lead-b");
  assert.equal(getActiveEmailComposerDraft(store)?.toEmail, "b@example.com");
  assert.equal(getActiveEmailComposerDraft(store)?.subject, "");
  assert.notEqual(getActiveEmailComposerDraft(store)?.toEmail, "a@example.com");
}

function testDiscardConfirmation() {
  let store = openLeadA();
  store = requestCloseEmailComposer(store);
  assert.equal(store.windowState, "closed");
  assert.equal(store.discardOpen, false);

  store = openLeadA();
  store = patchActiveEmailComposerDraft(store, { subject: "Draft", body: "" });
  assert.equal(isEmailComposerDraftDirty(getActiveEmailComposerDraft(store)!), true);
  store = requestCloseEmailComposer(store);
  assert.equal(store.discardOpen, true);
  assert.equal(store.windowState, "open");

  store = confirmDiscardEmailComposer(store);
  assert.equal(store.windowState, "closed");
  assert.equal(store.draftsByLeadId["lead-a"], undefined);
}

function testRecipientBinding() {
  let store = openEmailComposer(createEmptyEmailComposerStore(), {
    leadId: "lead-a",
    toEmail: "  a@example.com ",
    consented: false,
    recipientName: "Ada Lovelace",
  });
  const draft = getActiveEmailComposerDraft(store);
  assert.equal(draft?.toEmail, "a@example.com");
  assert.equal(draft?.leadId, "lead-a");
  assert.equal(draft?.recipientName, "Ada Lovelace");
  assert.equal(draft?.consented, false);
  assert.equal(store.statusTone, "info");

  store = openEmailComposer(createEmptyEmailComposerStore(), {
    leadId: "lead-x",
    toEmail: null,
    consented: true,
  });
  assert.equal(store.windowState, "closed");
  assert.equal(store.statusTone, "error");
}

function testSuccessfulSendingInterpretation() {
  assert.deepEqual(
    interpretAgentEmailSendResponse({
      httpStatus: 200,
      json: { ok: true, sent: 1, skipped: 0, errors: [], delivery: "sent" },
    }),
    { kind: "sent" },
  );
  let store = openLeadA();
  store = patchActiveEmailComposerDraft(store, {
    subject: "Hi",
    body: "There",
  });
  const draft = getActiveEmailComposerDraft(store)!;
  const snapshot = createEmailComposerSendSnapshot({
    draft,
    hostLeadId: "lead-a",
  });
  store = beginEmailComposerSend(store, snapshot);
  store = finishEmailComposerSendSuccess(store, snapshot.requestId);
  assert.equal(store.statusTone, "success");
  assert.ok(store.statusMessage?.includes("Email sent"));
  assert.equal(store.draftsByLeadId["lead-a"], undefined);
  assert.equal(store.inFlight, null);
}

function testSuppressedSkippedFeedback() {
  assert.deepEqual(
    interpretAgentEmailSendResponse({
      httpStatus: 200,
      json: {
        ok: true,
        sent: 0,
        skipped: 1,
        errors: ["a@example.com: suppressed"],
        delivery: "skipped",
      },
    }),
    {
      kind: "skipped",
      message: "a@example.com: suppressed",
    },
  );
  const legacyOkButSkipped = interpretAgentEmailSendResponse({
    httpStatus: 200,
    json: { ok: true, sent: 0, skipped: 1, errors: ["no CASL consent"] },
  });
  assert.equal(legacyOkButSkipped.kind, "skipped");
  assert.notEqual(legacyOkButSkipped.kind, "sent");

  let store = openLeadA();
  store = patchActiveEmailComposerDraft(store, {
    subject: "Hi",
    body: "There",
  });
  const draft = getActiveEmailComposerDraft(store)!;
  const snapshot = createEmailComposerSendSnapshot({
    draft,
    hostLeadId: "lead-a",
  });
  store = beginEmailComposerSend(store, snapshot);
  store = finishEmailComposerSendBlocked(
    store,
    snapshot.requestId,
    "a@example.com: suppressed",
  );
  assert.equal(store.statusTone, "error");
  assert.equal(store.statusMessage?.includes("Email sent"), false);
}

function testDuplicateSendPrevention() {
  assert.equal(
    canSubmitEmailComposer({
      toEmail: "a@example.com",
      consented: true,
      subject: "Hi",
      body: "Body",
      pending: true,
    }),
    false,
  );
  assert.equal(
    canSubmitEmailComposer({
      toEmail: "a@example.com",
      consented: true,
      subject: "Hi",
      body: "Body",
      pending: false,
      inFlight: true,
    }),
    false,
  );
  let store = openLeadA();
  store = patchActiveEmailComposerDraft(store, {
    subject: "Hi",
    body: "Body",
  });
  const draft = getActiveEmailComposerDraft(store)!;
  const snapshot = createEmailComposerSendSnapshot({
    draft,
    hostLeadId: "lead-a",
  });
  store = beginEmailComposerSend(store, snapshot);
  const again = beginEmailComposerSend(store, {
    ...snapshot,
    requestId: "req_other",
  });
  assert.equal(again.inFlight?.requestId, snapshot.requestId);
  assert.ok(emailComposerSendInProgress(store));
  const ctx = read(
    "src/components/agent/email-composer/email-composer-context.tsx",
  );
  assert.ok(ctx.includes("sendingRef"));
  assert.ok(ctx.includes("emailComposerSendInProgress"));
  assert.ok(ctx.includes("createEmailComposerSendSnapshot"));
  assert.ok(ctx.includes("activeRequestIdRef"));
}

function testLeadSwitchDuringActiveSend() {
  let store = openLeadA();
  store = patchActiveEmailComposerDraft(store, {
    subject: "In flight",
    body: "Do not lose me yet",
  });
  const draft = getActiveEmailComposerDraft(store)!;
  const snapshot = createEmailComposerSendSnapshot({
    draft,
    hostLeadId: "lead-a",
  });
  store = beginEmailComposerSend(store, snapshot);
  assert.equal(store.pending, true);
  assert.equal(store.inFlight?.leadId, "lead-a");
  assert.equal(store.inFlight?.compositionId, draft.compositionId);

  store = onEmailComposerHostLeadChange(store, "lead-b");
  assert.equal(store.windowState, "closed");
  assert.equal(store.activeLeadId, null);
  assert.equal(store.pending, false);
  // In-flight snapshot + unsent draft retained after navigation.
  assert.equal(store.inFlight?.requestId, snapshot.requestId);
  assert.equal(store.draftsByLeadId["lead-a"]?.subject, "In flight");
  assert.equal(
    shouldRefreshHostAfterEmailSend({
      sentLeadId: snapshot.leadId,
      hostLeadId: "lead-b",
    }),
    false,
  );
  assert.equal(
    shouldRefreshHostAfterEmailSend({
      sentLeadId: snapshot.leadId,
      hostLeadId: "lead-a",
    }),
    true,
  );
}

function testCompletionAfterOpeningAnotherLead() {
  let store = openLeadA();
  store = patchActiveEmailComposerDraft(store, {
    subject: "A subject",
    body: "A body",
  });
  const draftA = getActiveEmailComposerDraft(store)!;
  const snapshot = createEmailComposerSendSnapshot({
    draft: draftA,
    hostLeadId: "lead-a",
  });
  store = beginEmailComposerSend(store, snapshot);
  store = onEmailComposerHostLeadChange(store, "lead-b");
  store = openEmailComposer(store, {
    leadId: "lead-b",
    toEmail: "b@example.com",
    consented: true,
  });
  store = patchActiveEmailComposerDraft(store, {
    subject: "B draft",
    body: "Keep B",
  });
  assert.equal(store.activeLeadId, "lead-b");
  assert.equal(getActiveEmailComposerDraft(store)?.subject, "B draft");

  store = applyEmailComposerSendCompletion(store, {
    requestId: snapshot.requestId,
    outcome: "success",
  });
  // A's draft cleared on success; B's composition untouched.
  assert.equal(store.draftsByLeadId["lead-a"], undefined);
  assert.equal(store.draftsByLeadId["lead-b"]?.subject, "B draft");
  assert.equal(store.activeLeadId, "lead-b");
  assert.equal(store.statusTone, null);
  assert.equal(store.statusMessage, null);
  assert.equal(store.inFlight, null);
  assert.equal(store.pending, false);
}

function testSendingErrorAfterNavigation() {
  let store = openLeadA();
  store = patchActiveEmailComposerDraft(store, {
    subject: "Retry later",
    body: "Still here",
  });
  const draft = getActiveEmailComposerDraft(store)!;
  const snapshot = createEmailComposerSendSnapshot({
    draft,
    hostLeadId: "lead-a",
  });
  store = beginEmailComposerSend(store, snapshot);
  store = onEmailComposerHostLeadChange(store, "lead-b");
  store = openEmailComposer(store, {
    leadId: "lead-b",
    toEmail: "b@example.com",
    consented: true,
  });
  store = applyEmailComposerSendCompletion(store, {
    requestId: snapshot.requestId,
    outcome: "blocked",
    message: "Could not reach the email service. Try again.",
  });
  assert.equal(store.inFlight, null);
  assert.equal(store.statusTone, null);
  assert.equal(store.statusMessage, null);
  assert.equal(store.draftsByLeadId["lead-a"]?.subject, "Retry later");
  assert.equal(store.activeLeadId, "lead-b");
}

function testNoCrossLeadStatusContamination() {
  let store = openLeadA();
  store = patchActiveEmailComposerDraft(store, {
    subject: "A",
    body: "A",
  });
  const draft = getActiveEmailComposerDraft(store)!;
  const snapshot = createEmailComposerSendSnapshot({
    draft,
    hostLeadId: "lead-a",
  });
  store = beginEmailComposerSend(store, snapshot);
  store = onEmailComposerHostLeadChange(store, "lead-b");
  store = openEmailComposer(store, {
    leadId: "lead-b",
    toEmail: "b@example.com",
    consented: true,
  });

  // Stale / wrong request id must not mutate the open composition.
  const before = store;
  store = applyEmailComposerSendCompletion(store, {
    requestId: "req_stale",
    outcome: "success",
  });
  assert.equal(store, before);
  assert.equal(store.inFlight?.requestId, snapshot.requestId);

  store = applyEmailComposerSendCompletion(store, {
    requestId: snapshot.requestId,
    outcome: "blocked",
    message: "suppressed",
  });
  assert.equal(getActiveEmailComposerDraft(store)?.leadId, "lead-b");
  assert.notEqual(store.statusMessage, "suppressed");
  assert.equal(store.statusTone, null);
}

function testCorrectEmailHistoryRefreshGating() {
  const ctx = read(
    "src/components/agent/email-composer/email-composer-context.tsx",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(ctx.includes("shouldRefreshHostAfterEmailSend"));
  assert.ok(ctx.includes("onSentRef.current?.(snapshot.leadId)"));
  assert.ok(host.includes("sentLeadId !== hostLeadIdRef.current"));
  assert.equal(
    shouldRefreshHostAfterEmailSend({
      sentLeadId: "lead-a",
      hostLeadId: "lead-b",
    }),
    false,
  );
}

function testSignatureServerOwned() {
  const shell = read(
    "src/components/agent/email-composer/EmailComposerShell.tsx",
  );
  const ctx = read(
    "src/components/agent/email-composer/email-composer-context.tsx",
  );
  const route = read("src/app/api/agent/email/route.ts");
  assert.ok(
    shell.includes(
      "Signature and legal footer are added automatically when sent.",
    ),
  );
  assert.equal(shell.includes("appendAgentSignature"), false);
  assert.equal(ctx.includes("signature"), false);
  assert.ok(route.includes("renderAgentMessageEmail"));
  assert.ok(route.includes("sendAndLogClientEmail"));
  // Composer posts snapshot body only — chrome/signature remain server-side.
  assert.ok(ctx.includes("body: snapshot.body"));
  assert.ok(ctx.includes("subject: snapshot.subject"));
  assert.ok(ctx.includes("leadId: snapshot.leadId"));
}

function testTenantAuthorizationServerEnforced() {
  const route = read("src/app/api/agent/email/route.ts");
  assert.ok(route.includes("requireAgentContextFromRequest"));
  assert.ok(route.includes("canAccessLead(ctx, lead)"));
  assert.ok(route.includes("no CASL consent"));
  assert.ok(route.includes('delivery === "skipped"') || route.includes('"skipped"'));
  assert.ok(route.includes("result.status === \"suppressed\""));
  assert.ok(route.includes("sent += 1"));
  // Suppressed must not increment sent.
  const suppressedBlock =
    route.split('result.status === "suppressed"')[1]?.split(
      'result.status === "skipped"',
    )[0] ?? "";
  assert.ok(suppressedBlock.includes("skipped += 1"));
  assert.equal(suppressedBlock.includes("sent += 1"), false);
}

function testMobileLayoutBehavior() {
  const shell = read(
    "src/components/agent/email-composer/EmailComposerShell.tsx",
  );
  const vv = read("src/lib/visual-viewport-overlay-style.ts");
  assert.ok(shell.includes("createPortal"));
  assert.ok(shell.includes("document.body"));
  assert.ok(shell.includes("z-[105]"));
  assert.ok(shell.includes("visualViewportOverlayStyle"));
  assert.ok(shell.includes("visualViewport"));
  assert.ok(shell.includes("env(safe-area-inset-top"));
  assert.ok(shell.includes("env(safe-area-inset-bottom"));
  assert.ok(shell.includes("overlayRef"));
  assert.ok(shell.includes("lockScroll: open && !minimized"));
  assert.ok(shell.includes("sm:w-[min(36rem"));
  assert.ok(shell.includes("sm:items-end"));
  assert.ok(shell.includes('aria-modal="true"'));
  assert.ok(shell.includes("Escape"));
  // Desktop floating size preserved (sm: breakpoint), not device-pixel hacks.
  assert.ok(shell.includes("sm:h-[min(34rem"));
  assert.equal(shell.includes("paddingTop: 24"), false);
  assert.equal(shell.includes("statusBarHeight"), false);
  assert.ok(vv.includes("offsetLeft"));
  assert.ok(vv.includes("offsetTop"));
}

function testAndroidKeyboardViewportHandling() {
  const shell = read(
    "src/components/agent/email-composer/EmailComposerShell.tsx",
  );
  assert.ok(shell.includes('vv?.addEventListener("resize", syncViewport)'));
  assert.ok(shell.includes('vv?.addEventListener("scroll", syncViewport)'));
  assert.ok(shell.includes('window.addEventListener("resize", syncViewport)'));
  assert.ok(shell.includes("overflow-y-auto"));
  assert.ok(shell.includes("min-h-0 flex-1"));
  // Footer/Send stay in shrink-0 footer inside flex column.
  assert.ok(shell.includes("shrink-0 flex-col gap-2 border-t"));
}

function testNoFakePhase2Controls() {
  const shell = read(
    "src/components/agent/email-composer/EmailComposerShell.tsx",
  );
  for (const banned of ["CC", "Bcc", "Attach", "rich-text", "AI write", "autosave"]) {
    assert.equal(shell.includes(banned), false, `unexpected ${banned}`);
  }
}

function main() {
  testRailOpensComposer();
  testConversationsOpensSameComposer();
  testMinimizeMaximizeRestore();
  testLeadSwitchSafety();
  testDiscardConfirmation();
  testRecipientBinding();
  testSuccessfulSendingInterpretation();
  testSuppressedSkippedFeedback();
  testDuplicateSendPrevention();
  testLeadSwitchDuringActiveSend();
  testCompletionAfterOpeningAnotherLead();
  testSendingErrorAfterNavigation();
  testNoCrossLeadStatusContamination();
  testCorrectEmailHistoryRefreshGating();
  testSignatureServerOwned();
  testTenantAuthorizationServerEnforced();
  testMobileLayoutBehavior();
  testAndroidKeyboardViewportHandling();
  testNoFakePhase2Controls();
  console.log("email-composer-phase1-selftest: ok");
}

main();
