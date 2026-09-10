/**
 * Lead Profile V2 global note composer selftest.
 * Run: node --import tsx scripts/lead-profile-v2-note-composer-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyV2NoteCreateRefresh,
  shouldSkipV2NoteSubmit,
  V2_NOTE_CREATE_ENDPOINT,
  V2_NOTE_SUCCESS_MESSAGE_MS,
  v2NoteComposerCanSubmit,
  v2NoteComposerFailureMessage,
  v2NoteComposerPlaceholder,
  v2NoteComposerSuccessMessage,
  v2NoteCreatePayload,
  v2NoteCreateRefreshPlan,
} from "../src/lib/agent/lead-profile-v2/note-composer-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/app/api/agent/notes/route.ts",
  "src/app/api/agent/leads/[id]/summary/route.ts",
  "src/lib/agent/lead-summary.ts",
  "src/lib/agent/lead-profile-snapshot.ts",
  "src/lib/agent/lead-profile-panels.ts",
];

const V2_COMPOSER_FILES = [
  "src/lib/agent/lead-profile-v2/note-composer-query.ts",
  "src/components/agent/lead-profile-v2/LeadProfileV2NoteComposer.tsx",
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

function testNoV2MutationEndpoint() {
  const composer = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2NoteComposer.tsx",
  );
  const query = read("src/lib/agent/lead-profile-v2/note-composer-query.ts");
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(V2_NOTE_CREATE_ENDPOINT, "/api/agent/notes");
  assert.ok(composer.includes("V2_NOTE_CREATE_ENDPOINT"));
  assert.ok(composer.includes('method: "POST"'));
  assert.equal(composer.includes("leads-v2"), false);
  assert.equal(query.includes("leads-v2"), false);
  assert.equal(host.includes("/api/agent/notes-v2"), false);
}

function testPayloadParity() {
  assert.deepEqual(
    v2NoteCreatePayload({
      leadId: "lead-1",
      body: "  Hello pond  ",
      category: "GENERAL",
      pinned: false,
    }),
    {
      leadId: "lead-1",
      body: "Hello pond",
      category: "GENERAL",
      pinned: false,
    },
  );
  assert.deepEqual(
    v2NoteCreatePayload({
      leadId: "lead-1",
      body: "Called the client",
      category: "CALL",
      pinned: true,
    }),
    {
      leadId: "lead-1",
      body: "Called the client",
      category: "CALL",
      pinned: true,
    },
  );
  const payload = JSON.stringify(
    v2NoteCreatePayload({
      leadId: "lead-1",
      body: "x",
      category: "GENERAL",
      pinned: false,
    }),
  );
  assert.equal(payload.includes("workspace"), false);
  const composer = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2NoteComposer.tsx",
  );
  assert.ok(composer.includes("v2NoteCreatePayload("));
  assert.ok(composer.includes("JSON.stringify(payload)"));
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  assert.ok(legacy.includes('leadId,'));
  assert.ok(legacy.includes("body: noteBody.trim()"));
  assert.ok(legacy.includes("category: noteCategory"));
  assert.ok(legacy.includes("pinned: notePinned"));
}

function testEmptyInvalidBody() {
  assert.equal(
    shouldSkipV2NoteSubmit({ body: "", inFlight: false }),
    true,
  );
  assert.equal(
    shouldSkipV2NoteSubmit({ body: "   ", inFlight: false }),
    true,
  );
  assert.equal(
    shouldSkipV2NoteSubmit({ body: "ok", inFlight: false }),
    false,
  );
  assert.equal(
    v2NoteComposerCanSubmit({ body: "", pending: false }),
    false,
  );
  assert.equal(
    v2NoteComposerCanSubmit({ body: "note", pending: true }),
    false,
  );
  assert.equal(
    v2NoteComposerCanSubmit({ body: "note", pending: false }),
    true,
  );
  const composer = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2NoteComposer.tsx",
  );
  assert.ok(composer.includes("shouldSkipV2NoteSubmit"));
  assert.ok(composer.includes("v2NoteComposerCanSubmit"));
}

function testDuplicateSubmitProtection() {
  assert.equal(
    shouldSkipV2NoteSubmit({ body: "note", inFlight: true }),
    true,
  );
  const composer = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2NoteComposer.tsx",
  );
  assert.ok(composer.includes("inFlightRef"));
  assert.ok(composer.includes("inFlightRef.current = true"));
  assert.ok(composer.includes("inFlightRef.current = false"));
  assert.ok(composer.includes('notePending ? "…" : "Save"'));
  assert.equal(composer.includes("retries"), false);
  assert.equal(composer.includes("for (let attempt"), false);
}

function testSuccessAndFailureBehavior() {
  assert.equal(
    v2NoteComposerSuccessMessage({ category: "GENERAL", pinned: false }),
    "General note saved",
  );
  assert.equal(
    v2NoteComposerSuccessMessage({ category: "CALL", pinned: false }),
    "Call note saved",
  );
  assert.equal(
    v2NoteComposerSuccessMessage({ category: "GENERAL", pinned: true }),
    "General note pinned",
  );
  assert.equal(
    v2NoteComposerSuccessMessage({ category: "CALL", pinned: true }),
    "Call note pinned",
  );
  assert.equal(V2_NOTE_SUCCESS_MESSAGE_MS, 2000);
  assert.equal(
    v2NoteComposerFailureMessage(new Error("Invalid payload")),
    "Invalid payload",
  );
  assert.equal(
    v2NoteComposerFailureMessage("nope"),
    "Could not save note",
  );
  const composer = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2NoteComposer.tsx",
  );
  const successBlock =
    composer.split("if (!res.ok)")[1]?.split("} catch")[0] ?? "";
  const catchBlock = composer.split("} catch (err)")[1]?.split("} finally")[0] ?? "";
  assert.ok(successBlock.includes('setNoteBody("")'));
  assert.ok(successBlock.includes("setNotePinned(false)"));
  assert.ok(successBlock.includes("onCreated()"));
  assert.ok(successBlock.includes("V2_NOTE_SUCCESS_MESSAGE_MS"));
  assert.equal(catchBlock.includes("setNoteBody"), false);
  assert.equal(catchBlock.includes("setNotePinned"), false);
  assert.ok(catchBlock.includes("v2NoteComposerFailureMessage"));
  assert.ok(composer.includes("onCreated()"));
}

function testPlaceholdersAndCopy() {
  assert.equal(v2NoteComposerPlaceholder("CALL"), "Add a call note...");
  assert.equal(v2NoteComposerPlaceholder("GENERAL"), "Add a note...");
  const composer = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2NoteComposer.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const snippet of [
    'aria-label="Note category"',
    '["GENERAL", "General"]',
    '["CALL", "Call"]',
    'title={notePinned ? "Unpin note" : "Pin note to top of activity"}',
    '{notePinned ? "Pinned" : "Pin"}',
    'className="shrink-0 border-b border-[#e8edf2] bg-white px-4 py-2.5"',
    "rounded-md bg-[#1e2a38] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40",
    "mt-1.5 text-[11px] font-medium text-[#64748b]",
  ]) {
    assert.ok(legacy.includes(snippet), `legacy missing ${snippet}`);
    assert.ok(composer.includes(snippet), `v2 missing ${snippet}`);
  }
}

function testTargetedRefresh() {
  const onReminders = v2NoteCreateRefreshPlan("reminders");
  assert.equal(onReminders.reloadTimeline, true);
  assert.equal(onReminders.reloadTasks, true);
  assert.equal(onReminders.invalidateTasks, false);
  assert.equal(onReminders.reloadShell, false);
  assert.equal(onReminders.reloadRail, false);
  assert.equal(onReminders.reloadLookingFor, false);
  assert.equal(onReminders.reloadNextReminder, false);
  assert.equal(onReminders.reloadEmails, false);
  assert.equal(onReminders.reloadAppointments, false);
  assert.equal(onReminders.reloadEngagement, false);

  const onActivity = v2NoteCreateRefreshPlan("activity");
  assert.equal(onActivity.reloadTasks, false);
  assert.equal(onActivity.invalidateTasks, true);
  assert.equal(onActivity.reloadTimeline, true);

  const calls: string[] = [];
  applyV2NoteCreateRefresh({
    tab: "activity",
    reloadTimeline: () => calls.push("timeline"),
    reloadTasks: () => calls.push("reloadTasks"),
    invalidateTasks: () => calls.push("invalidateTasks"),
  });
  assert.deepEqual(calls, ["timeline", "invalidateTasks"]);

  const reminderCalls: string[] = [];
  applyV2NoteCreateRefresh({
    tab: "reminders",
    reloadTimeline: () => reminderCalls.push("timeline"),
    reloadTasks: () => reminderCalls.push("reloadTasks"),
    invalidateTasks: () => reminderCalls.push("invalidateTasks"),
  });
  assert.deepEqual(reminderCalls, ["timeline", "reloadTasks"]);

  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const created =
    host.split("const onNoteCreated")[1]?.split("const onEmailSent")[0] ?? "";
  assert.ok(created.includes("applyV2NoteCreateRefresh"));
  assert.ok(created.includes("reloadTimeline: reloadDefaultTimeline"));
  assert.ok(created.includes("reloadTasks"));
  assert.ok(created.includes("invalidateTasks"));
  assert.equal(created.includes("reload()"), false);
  assert.equal(created.includes("reloadRail()"), false);
  assert.equal(created.includes("reloadLookingFor()"), false);
  assert.equal(created.includes("reloadNextReminder()"), false);
  assert.equal(created.includes("reloadEmails()"), false);
  assert.ok(host.includes("<LeadProfileV2NoteComposer"));
  assert.ok(host.includes("onCreated={onNoteCreated}"));
  const section =
    host.split("bg-[#f7f9fb] lg:min-h-0 lg:overflow-hidden")[1] ?? "";
  const composerIdx = section.indexOf("LeadProfileV2NoteComposer");
  const tabsIdx = section.indexOf("<LeadProfileV2Tabs");
  assert.ok(composerIdx >= 0 && tabsIdx > composerIdx);
}

function testServerAuthorizationPreserved() {
  const notes = read("src/app/api/agent/notes/route.ts");
  assert.ok(notes.includes("requireAgentContextFromRequest(request)"));
  assert.ok(notes.includes("canAccessLead(ctx, lead)"));
  assert.ok(notes.includes('z.enum(["GENERAL", "CALL"])'));
  assert.ok(notes.includes("pinned: z.boolean().optional()"));
  assert.equal(notes.includes("workspaceId: z."), false);
  assert.equal(notes.includes("lead-profile-v2"), false);
  for (const rel of V2_COMPOSER_FILES) {
    const src = read(rel);
    assert.equal(src.includes("canAccessLead"), false);
  }
}

function testHostDoesNotImportLegacyProfile() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const composer = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2NoteComposer.tsx",
  );
  assert.equal(host.includes("CustomerProfile"), false);
  assert.equal(composer.includes("CustomerProfile"), false);
  assert.equal(host.includes("/summary"), false);
}

function main() {
  testLegacyUntouchedByV2Imports();
  testNoV2MutationEndpoint();
  testPayloadParity();
  testEmptyInvalidBody();
  testDuplicateSubmitProtection();
  testSuccessAndFailureBehavior();
  testPlaceholdersAndCopy();
  testTargetedRefresh();
  testServerAuthorizationPreserved();
  testHostDoesNotImportLegacyProfile();
  console.log("lead-profile-v2-note-composer-selftest: ok");
}

main();
