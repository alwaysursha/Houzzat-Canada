/**
 * Native Call Outcome session, payload, and screen wiring.
 * Run: node --import tsx apps/pro-mobile/test/call-outcome.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  callOutcomeRequestBody,
  agentCallOutcomeUrl,
  pickerWallClockValue,
} from "../src/lib/call-outcome-client";
import {
  cancelCallOutcomeFlow,
  createCallOutcomeRequestId,
  noteCallOutcomeAppState,
  noteDialerHandedOff,
  openCallOutcomeIfReturned,
  revealCallOutcomeWithoutLeave,
  settleForegroundFallback,
  startCallOutcomeFlow,
} from "../src/lib/call-outcome-session";
import {
  CALL_OUTCOME_CHOICES,
  FOLLOW_UP_CHOICES,
  callOutcomeAllowsDetails,
  callOutcomeConfirmation,
  resolveFollowUpInstant,
} from "../../../src/lib/agent/call-outcome-presentation";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function testDialerLifecycle() {
  const first = createCallOutcomeRequestId();
  const second = createCallOutcomeRequestId();
  assert.notEqual(first, second);
  assert.ok(first.length >= 8);

  const started = startCallOutcomeFlow(first);
  assert.equal(started.status, "pending_return");
  if (started.status !== "pending_return") return;
  assert.equal(started.requestId, first);

  const handed = noteDialerHandedOff(started);
  assert.equal(handed.status, "pending_return");
  const stillWaiting = openCallOutcomeIfReturned(handed, "active");
  assert.equal(stillWaiting.status, "pending_return");

  const left = noteCallOutcomeAppState(handed, "inactive");
  assert.equal(left.status, "pending_return");
  if (left.status !== "pending_return") return;
  assert.equal(left.leftApp, true);
  const backgrounded = noteCallOutcomeAppState(left, "background");
  assert.equal(backgrounded.status, "pending_return");
  const returned = noteCallOutcomeAppState(backgrounded, "active");
  assert.equal(returned.status, "open");
  if (returned.status !== "open") return;
  assert.equal(returned.requestId, first);

  const stayed = revealCallOutcomeWithoutLeave(handed);
  assert.equal(stayed.status, "open");
  if (stayed.status !== "open") return;
  assert.equal(stayed.requestId, first);

  const failed = cancelCallOutcomeFlow();
  assert.equal(failed.status, "idle");

  const dismissed = cancelCallOutcomeFlow();
  assert.equal(dismissed.status, "idle");
  const next = startCallOutcomeFlow(second);
  assert.equal(next.status, "pending_return");
  if (next.status !== "pending_return") return;
  assert.equal(next.requestId, second);
  assert.notEqual(next.requestId, first);

  const duringSave = noteCallOutcomeAppState(returned, "background");
  assert.equal(duringSave.status, "open");
  if (duringSave.status !== "open") return;
  assert.equal(duringSave.requestId, first);
  const back = noteCallOutcomeAppState(duringSave, "active");
  assert.equal(back.status, "open");
  if (back.status !== "open") return;
  assert.equal(back.requestId, first);

  const staleTimer = settleForegroundFallback(cancelCallOutcomeFlow(), first, "active");
  assert.equal(staleTimer.status, "idle");

  const handedSecond = noteDialerHandedOff(next);
  const newer = settleForegroundFallback(handedSecond, first, "active");
  assert.equal(newer.status, "pending_return");
  if (newer.status !== "pending_return") return;
  assert.equal(newer.requestId, second);

  const current = settleForegroundFallback(handedSecond, second, "active");
  assert.equal(current.status, "open");
  assert.equal(settleForegroundFallback(handedSecond, second, "background").status, "pending_return");
  const stillOpen = settleForegroundFallback(returned, second, "active");
  assert.equal(stillOpen.status, "open");
  if (stillOpen.status === "open") assert.equal(stillOpen.requestId, first);

  const leftAlready = noteCallOutcomeAppState(handedSecond, "background");
  assert.equal(settleForegroundFallback(leftAlready, second, "active").status, "pending_return");
}

function testPayloadAndFollowUp() {
  assert.equal(callOutcomeAllowsDetails("SPOKE_TO_LEAD"), true);
  assert.equal(callOutcomeAllowsDetails("LEFT_VOICEMAIL"), true);
  assert.equal(callOutcomeAllowsDetails("INVALID_NUMBER"), false);
  assert.equal(callOutcomeAllowsDetails("WRONG_NUMBER"), false);
  assert.ok(callOutcomeConfirmation("INVALID_NUMBER")?.includes("update their phone number"));
  assert.ok(callOutcomeConfirmation("WRONG_NUMBER")?.includes("provide the correct phone number"));
  assert.ok(callOutcomeConfirmation("INVALID_NUMBER")?.includes("stays on the profile"));
  assert.equal(callOutcomeConfirmation("SPOKE_TO_LEAD"), null);

  const now = new Date("2026-01-15T15:00:00.000Z");
  assert.equal(resolveFollowUpInstant(null, now), null);
  assert.equal(resolveFollowUpInstant("none", now), null);
  const tomorrow = resolveFollowUpInstant("tomorrow", now);
  assert.ok(tomorrow);
  assert.equal(resolveFollowUpInstant("custom", now, ""), null);
  const custom = resolveFollowUpInstant("custom", now, "2026-10-05T15:30");
  assert.ok(custom);
  assert.deepEqual(
    FOLLOW_UP_CHOICES.map((choice) => choice.label),
    ["Later Today", "Tomorrow", "In 2 Days", "Custom", "No Follow-up"],
  );
  assert.deepEqual(
    CALL_OUTCOME_CHOICES.map((choice) => choice.label),
    ["Spoke to Lead", "Left Voicemail", "Invalid Number", "Wrong Number"],
  );

  const requestId = "req-mobile-0001";
  const spoke = callOutcomeRequestBody({
    leadId: "lead-1",
    outcome: "SPOKE_TO_LEAD",
    note: "  Left a note  ",
    followUpDueAt: tomorrow,
    clientRequestId: requestId,
  });
  assert.deepEqual(Object.keys(spoke).sort(), [
    "clientRequestId",
    "followUpDueAt",
    "leadId",
    "note",
    "outcome",
  ]);
  assert.equal(spoke.clientRequestId, requestId);
  const retry = callOutcomeRequestBody({
    leadId: "lead-1",
    outcome: "SPOKE_TO_LEAD",
    note: "  Left a note  ",
    followUpDueAt: tomorrow,
    clientRequestId: requestId,
  });
  assert.equal(retry.clientRequestId, spoke.clientRequestId);

  const invalid = callOutcomeRequestBody({
    leadId: "lead-1",
    outcome: "INVALID_NUMBER",
    note: "ignored",
    followUpDueAt: tomorrow,
    clientRequestId: requestId,
  });
  assert.equal(invalid.note, undefined);
  assert.equal(invalid.followUpDueAt, undefined);
  assert.equal("workspaceId" in invalid, false);
  assert.equal("customerId" in invalid, false);

  assert.equal(
    agentCallOutcomeUrl("https://app.houzzatpro.com/api/mobile/v2"),
    "https://app.houzzatpro.com/api/agent/leads/call-outcome",
  );
  assert.equal(pickerWallClockValue(new Date(2026, 9, 5, 15, 30)), "2026-10-05T15:30");
}

function testScreenWiring() {
  const screen = readFileSync(join(root, "src/screens/LeadDetailScreen.tsx"), "utf8");
  const handleCall = screen.slice(screen.indexOf("const handleCall"), screen.indexOf("const handleSms"));
  const handleSms = screen.slice(screen.indexOf("const handleSms"), screen.indexOf("const handleEmail"));
  assert.ok(handleCall.includes("Linking.openURL"));
  assert.ok(handleCall.includes("Linking.canOpenURL"));
  assert.equal(handleCall.includes("fetch("), false);
  assert.equal(handleCall.includes("call-outcome"), false);
  assert.ok(handleCall.includes("startCallOutcomeFlow"));
  assert.ok(handleCall.includes('callFlowRef.current.status !== "idle"'));
  assert.ok(handleCall.includes("cancelCallOutcomeFlow"));
  assert.ok(handleCall.includes("armedRequestId"));
  assert.ok(handleCall.includes("settleForegroundFallback"));
  assert.ok(handleSms.includes("openNativeUrl"));
  assert.ok(handleSms.includes("SMS unavailable"));
  assert.equal(handleSms.includes("call-outcome"), false);
  assert.ok(screen.includes("AppState.addEventListener"));
  assert.ok(screen.includes("CallOutcomeSheet"));
  assert.ok(screen.includes("handleRefresh()"));
  assert.equal(screen.toLowerCase().includes("twilio"), false);

  const sheet = readFileSync(join(root, "src/components/CallOutcomeSheet.tsx"), "utf8");
  assert.ok(sheet.includes("CALL_OUTCOME_CHOICES"));
  assert.ok(sheet.includes("FOLLOW_UP_CHOICES"));
  assert.ok(sheet.includes("callOutcomeAllowsDetails"));
  assert.ok(sheet.includes("callOutcomeConfirmation"));
  assert.ok(sheet.includes("Couldn't save this call. Try again."));
  assert.ok(sheet.includes("clientRequestId: requestId"));
  assert.ok(sheet.includes("if (!outcome || saving || customIncomplete) return;"));
  assert.equal((sheet.match(/await postMobileCallOutcome/g) ?? []).length, 1);
  assert.equal(sheet.toLowerCase().includes("twilio"), false);
  assert.equal(sheet.includes("WebView"), false);
  assert.ok(sheet.includes("useSafeAreaInsets"));
  assert.ok(sheet.includes("KeyboardAvoidingView"));
}

testDialerLifecycle();
testPayloadAndFollowUp();
testScreenWiring();
console.log("pro-mobile call-outcome: ok");
