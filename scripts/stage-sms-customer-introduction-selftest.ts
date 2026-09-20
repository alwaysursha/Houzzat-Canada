/**
 * Customer Introduction (lead.welcome_new_signup key retained).
 * Run: pnpm sms-customer-introduction:selftest
 *
 * No production writes. No Twilio send. No deploy.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { conversationActivityFromLeadActivity } from "../src/lib/agent/conversation-activity";
import {
  SMS_AUTOMATION_CATALOG,
  smsAutomationDisplayName,
  smsAutomationTranscriptLabel,
} from "../src/lib/platform/sms-automations/catalog";
import {
  becameFirstValidCustomerE164,
  isCustomerIntroductionAutomationKey,
  isRetryableCustomerIntroductionSkip,
} from "../src/lib/sms/automations/customer-introduction";
import { resolveAssignedAgentNotifyDestination } from "../src/lib/sms/assigned-agent-inbound-notify";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testCatalogKeepsKeyAndReframesName() {
  const intro = SMS_AUTOMATION_CATALOG.find(
    (row) => row.key === "lead.welcome_new_signup",
  );
  assert.ok(intro);
  assert.equal(intro?.name, "Customer Introduction");
  assert.equal(intro?.triggerKey, "CUSTOMER_FIRST_CELLPHONE");
  assert.equal(intro?.recipient, "LEAD");
  assert.equal(isCustomerIntroductionAutomationKey("lead.welcome_new_signup"), true);
  assert.equal(isCustomerIntroductionAutomationKey("agent.new_lead_signup"), false);
  assert.equal(
    smsAutomationDisplayName("lead.welcome_new_signup"),
    "Customer Introduction",
  );
  assert.equal(
    smsAutomationTranscriptLabel({ automationKey: "lead.welcome_new_signup" }),
    "Automated · Customer Introduction",
  );
  assert.equal(
    conversationActivityFromLeadActivity({
      type: "SMS",
      meta: {
        channel: "SMS",
        recipient: "LEAD",
        automationKey: "lead.welcome_new_signup",
      },
    }).automationName,
    "Customer Introduction",
  );
}

function testFirstValidCellphoneSemantics() {
  assert.equal(
    becameFirstValidCustomerE164({
      previousPhone: null,
      previousPhoneE164: null,
      nextPhone: "647-555-0101",
      nextPhoneE164: "+16475550101",
    }),
    true,
  );
  assert.equal(
    becameFirstValidCustomerE164({
      previousPhone: null,
      previousPhoneE164: null,
      nextPhone: "555-0100",
      nextPhoneE164: null,
    }),
    false,
  );
  assert.equal(
    becameFirstValidCustomerE164({
      previousPhone: "647-555-0101",
      previousPhoneE164: "+16475550101",
      nextPhone: "416-555-0199",
      nextPhoneE164: "+14165550199",
    }),
    false,
  );
  assert.equal(
    becameFirstValidCustomerE164({
      previousPhone: "647-555-0101",
      previousPhoneE164: "+16475550101",
      nextPhone: "647-555-0101",
      nextPhoneE164: "+16475550101",
    }),
    false,
  );
}

function testHistoricalSkipPolicy() {
  assert.equal(
    isRetryableCustomerIntroductionSkip({
      automationKey: "lead.welcome_new_signup",
      status: "SKIPPED",
      errorCode: "NO_CUSTOMER_E164",
    }),
    true,
  );
  assert.equal(
    isRetryableCustomerIntroductionSkip({
      automationKey: "lead.welcome_new_signup",
      status: "SKIPPED",
      errorCode: "SUPPRESSED",
    }),
    false,
  );
  assert.equal(
    isRetryableCustomerIntroductionSkip({
      automationKey: "lead.welcome_new_signup",
      status: "SENT",
      errorCode: null,
    }),
    false,
  );
}

function testAgentDestinationNeverFallsBackToCustomer() {
  assert.equal(
    resolveAssignedAgentNotifyDestination({
      agentPhoneE164: "+16475550001",
      agentPhone: "+16475550001",
      leadPhoneE164: "+14165550101",
    }).to,
    "+16475550001",
  );
  assert.equal(
    resolveAssignedAgentNotifyDestination({
      agentPhoneE164: "+16475550001",
      agentPhone: "+16475550001",
      leadPhoneE164: "+16475550001",
    }).reason,
    "AGENT_PHONE_IS_LEAD",
  );
  assert.equal(
    resolveAssignedAgentNotifyDestination({
      agentPhoneE164: null,
      agentPhone: null,
      leadPhoneE164: "+14165550101",
    }).reason,
    "NO_AGENT_PHONE",
  );
}

function testContactAndSignupWiring() {
  const contact = read("src/app/api/account/contact/route.ts");
  assert.ok(contact.includes("scheduleCustomerIntroductionIfFirstValidE164"));
  const prefs = read("src/app/api/account/preferences/route.ts");
  assert.ok(prefs.includes("scheduleCustomerIntroductionIfFirstValidE164"));
  const agent = read("src/app/api/agent/leads/contact/route.ts");
  assert.ok(agent.includes("scheduleCustomerIntroductionIfFirstValidE164"));
  const mobile = read("src/app/api/mobile/v2/leads/[leadId]/contact/route.ts");
  assert.ok(mobile.includes("scheduleCustomerIntroductionIfFirstValidE164"));
  const intake = read("src/lib/agent/lead-intake.ts");
  assert.ok(intake.includes("scheduleSignupSmsAutomations"));
  assert.ok(intake.includes("scheduleCustomerIntroductionSmsAutomationsForLead"));
  const execute = read("src/lib/sms/automations/execute.ts");
  assert.ok(execute.includes("isCustomerIntroductionAutomationKey"));
  assert.ok(execute.includes("DEFERRED"));
  assert.ok(execute.includes("resolveAssignedAgentNotifyDestination"));
}

function main() {
  testCatalogKeepsKeyAndReframesName();
  testFirstValidCellphoneSemantics();
  testHistoricalSkipPolicy();
  testAgentDestinationNeverFallsBackToCustomer();
  testContactAndSignupWiring();
  console.log("sms-customer-introduction selftest ok");
}

main();
