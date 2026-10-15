/**
 * Registration UX + agent notify polish.
 * Run: node --import tsx scripts/registration-ux-notify-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SIGNUP_QUALIFICATION_CYCLE_KEY,
  SIGNUP_QUALIFICATION_EMAIL_CYCLE_KEY,
  SIGNUP_QUALIFICATION_SMS_CYCLE_KEY,
  SIGNUP_QUALIFICATION_UPDATE_KEY,
  qualificationNotifyDispatchStatus,
} from "../src/lib/notifications/signup-lead-notify";
import { sanitizePushHref } from "../src/lib/notifications/push-href";
import {
  customerChatUnreadAutoOpenBatchKey,
  findLatestUnreadAgentMessageId,
  shouldAutoOpenCustomerChatForUnread,
} from "../src/lib/customer-chat/floating-chat";
import {
  isIncomingForCustomer,
  type ConversationReadMessage,
} from "../src/lib/conversations/read-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function agentSmsMessage(
  overrides: Partial<ConversationReadMessage> = {},
): ConversationReadMessage {
  return {
    id: "welcome-sms-1",
    createdAt: new Date("2026-10-15T12:00:00.000Z"),
    senderKind: "AGENT",
    senderUserId: "agent-1",
    deletedAt: null,
    kind: "TEXT",
    payload: null,
    providerStatus: "queued",
    deliveredAt: null,
    twilioMessageSid: "SM_test",
    channel: "SMS",
    ...overrides,
  };
}

function testRegistrationUxWiring() {
  const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
  assert.equal(funnel.includes("Is this search correct?"), false);
  assert.equal(funnel.includes("ArrowLeft"), false);
  assert.equal(funnel.includes(">Back"), false);
  assert.ok(funnel.includes("Skip for now"));
  assert.ok(funnel.includes("Maybe Later"));
  assert.ok(funnel.includes("void finish()"));
  assert.ok(funnel.includes("QUALIFICATION_COMPLETED_EVENT"));

  const qual = read("src/app/api/auth/qualification/route.ts");
  assert.ok(qual.includes('source: "observed"'));
  assert.ok(qual.includes("scheduleSignupQualificationCompletedNotify"));
  assert.ok(qual.includes("upsertQualificationSavedSearch"));

  const intake = read("src/lib/agent/lead-intake.ts");
  assert.ok(intake.includes("scheduleAgentNewLeadSignupSms"));
  assert.ok(intake.includes("brand,"));
  // No customer welcome at registration — agent-only signup notify.
  assert.equal(intake.includes("scheduleSignupSmsAutomations(lead.id)"), false);

  const triggers = read("src/lib/sms/automations/triggers.ts");
  assert.ok(triggers.includes("runAgentNewLeadSignupSms"));
  assert.ok(
    triggers.includes("customer introduction deferred until qualification browse"),
  );

  const welcomeApi = read("src/app/api/auth/welcome-introduction/route.ts");
  assert.ok(welcomeApi.includes("qualificationCompletedAt"));
  assert.ok(welcomeApi.includes("customer_chat_exists"));
  assert.ok(welcomeApi.includes("scheduleCustomerIntroductionSmsAutomationsForLead"));
  // Abandoned qualification cannot arm welcome.
  assert.ok(welcomeApi.includes("qualification_incomplete"));

  const scheduler = read(
    "src/components/auth/CustomerWelcomeChatScheduler.tsx",
  );
  assert.ok(scheduler.includes("60_000"));
  assert.ok(scheduler.includes("visibilityState"));
  assert.ok(scheduler.includes("/api/auth/welcome-introduction"));

  const providers = read("src/components/Providers.tsx");
  assert.ok(providers.includes("CustomerWelcomeChatScheduler"));

  const staff = read("src/lib/notifications/staff-events.ts");
  assert.ok(staff.includes("buildSignupLeadNotifyContent"));
  assert.ok(staff.includes("html,"));

  // CRM deep links still sanitize for FCM path (regression).
  assert.equal(
    sanitizePushHref("/agent/chats?lead=x"),
    "/agent/chats?lead=x",
  );
}

/**
 * lead.welcome_new_signup creates an SMS Message with senderKind AGENT.
 * That message is customer-unread and drives CustomerChatUnreadPreview
 * (setMode("preview")) — the same website Welcome Chat alert as before delay.
 */
function testDelayedWelcomeUsesExistingChatUnreadAlert() {
  const execute = read("src/lib/sms/automations/execute.ts");
  assert.ok(execute.includes('channel: "SMS"'));
  assert.ok(
    execute.includes('senderKind: lead.assignedAgent ? "AGENT" : "SYSTEM"'),
  );
  assert.ok(execute.includes("createConversationMessage"));

  // Unread counting includes non-CUSTOMER SMS (welcome qualifies).
  assert.equal(isIncomingForCustomer(agentSmsMessage()), true);
  assert.equal(
    isIncomingForCustomer(agentSmsMessage({ senderKind: "CUSTOMER" })),
    false,
  );

  const latest = findLatestUnreadAgentMessageId({
    messages: [
      {
        id: "welcome-sms-1",
        senderKind: "AGENT",
        createdAt: "2026-10-15T12:00:00.000Z",
      },
    ],
    customerLastReadAt: null,
    unreadCount: 1,
  });
  assert.equal(latest, "welcome-sms-1");

  const batchKey = customerChatUnreadAutoOpenBatchKey({
    conversationId: "conv-welcome",
    unreadCount: 1,
    latestUnreadAgentMessageId: latest,
  });
  assert.equal(batchKey, "conv-welcome:1:welcome-sms-1");
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "closed",
      batchKey,
      alreadyOpenedBatchKey: null,
      dismissedBatchKey: null,
      deferAutoOpen: false,
    }),
    true,
  );

  const provider = read("src/components/customer-chat/CustomerChatProvider.tsx");
  assert.ok(provider.includes("findLatestUnreadAgentMessageId"));
  assert.ok(provider.includes('setMode("preview")'));
  assert.ok(provider.includes("CustomerChatUnreadPreview"));

  // No second welcome / competing notification path on the scheduler.
  const scheduler = read(
    "src/components/auth/CustomerWelcomeChatScheduler.tsx",
  );
  assert.equal(scheduler.includes("sendNotification"), false);
  assert.equal(scheduler.includes("createConversationMessage"), false);
  assert.ok(scheduler.includes("welcome-introduction"));
}

function testQualificationNotifyRetrySafeDedupe() {
  assert.equal(
    SIGNUP_QUALIFICATION_UPDATE_KEY,
    "agent.signup_qualification_update",
  );
  assert.equal(SIGNUP_QUALIFICATION_CYCLE_KEY, "qualification");
  assert.equal(SIGNUP_QUALIFICATION_EMAIL_CYCLE_KEY, "qualification:email");
  assert.equal(SIGNUP_QUALIFICATION_SMS_CYCLE_KEY, "qualification:sms");

  assert.equal(qualificationNotifyDispatchStatus("sent"), "SENT");
  assert.equal(qualificationNotifyDispatchStatus("failed"), "FAILED");
  assert.equal(qualificationNotifyDispatchStatus("skipped"), "SKIPPED");

  const notify = read("src/lib/notifications/signup-lead-notify.ts");
  assert.ok(notify.includes("emailLayout"));
  assert.ok(notify.includes("Open lead in HouzzatPro"));
  assert.ok(notify.includes("qualification:email"));
  assert.ok(notify.includes("qualification:sms"));
  assert.ok(notify.includes("claimQualificationNotifyChannel"));
  assert.ok(notify.includes("finishQualificationNotifyChannel"));
  assert.ok(notify.includes("hasLegacyQualificationNotifyClaim"));
  // Claim-before-send with SENT permanently suppressed retries — must be gone.
  assert.equal(notify.includes("claimQualificationNotifyDedupe"), false);
  // Email and SMS are claimed/finished independently.
  assert.ok(notify.includes('channel: "email"'));
  assert.ok(notify.includes('channel: "sms"'));
  assert.ok(notify.includes('status: "FAILED"'));
  // Auth / prefs still gate before send.
  assert.ok(notify.includes("filterStaffRecipientsForLead"));
  assert.ok(notify.includes('isStaffEmailCategoryEnabled'));
  assert.ok(notify.includes("isAgentRole"));
}

function testPartialSignupStillSendsInitialAgentNotify() {
  const intake = read("src/lib/agent/lead-intake.ts");
  assert.ok(intake.includes("scheduleAgentNewLeadSignupSms"));
  const staff = read("src/lib/notifications/staff-events.ts");
  assert.ok(
    staff.includes("agent.new_lead_signup") ||
      staff.includes("new_lead_signup") ||
      staff.includes("buildSignupLeadNotifyContent"),
  );
  // Initial signup notify is separate from qualification update.
  const notify = read("src/lib/notifications/signup-lead-notify.ts");
  assert.ok(notify.includes('"initial"'));
  assert.ok(notify.includes('"qualification"'));
}

function main() {
  testRegistrationUxWiring();
  testDelayedWelcomeUsesExistingChatUnreadAlert();
  testQualificationNotifyRetrySafeDedupe();
  testPartialSignupStillSendsInitialAgentNotify();
  console.log("registration-ux-notify-selftest: OK");
}

main();
