/**
 * Contact phone / E.164 consistency.
 * Run: pnpm contact-phone-e164:selftest
 *
 * No production writes. No Twilio send. No deploy.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  OrgMembershipRole,
  Role,
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceStatus,
} from "@prisma/client";
import type { AgentOrgContext } from "../src/lib/agent";
import { evaluateAgentSmsEligibility } from "../src/lib/conversations/agent-conversation-sms";
import {
  contactSmsHref,
  contactTelHref,
  INVALID_CONTACT_PHONE_MESSAGE,
  parsePhoneColumnsForWrite,
  phoneColumnsForWrite,
  resolveCommunicationsE164,
} from "../src/lib/sms/e164";
import { classifyMassSmsLead } from "../src/lib/sms/mass/eligibility";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const AGENT_A = "user_agent_a";
const WS_A = "ws_a";
const FROM = "+16475550199";
const SUB_A = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MG_A = "MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function makeCtx(): AgentOrgContext {
  return {
    user: {
      id: AGENT_A,
      email: "agent@test.local",
      name: "Ali Agent",
      image: null,
      phone: null,
      role: "AGENT" as Role,
    },
    organizationId: "org_a",
    organizationName: "Tenant A",
    organizationIds: ["org_a"],
    membershipRole: "MEMBER" as OrgMembershipRole,
    canSeeTeamLeads: false,
    isPlatformAdmin: false,
    workspaceId: WS_A,
    workspaceRole: "AGENT" as WorkspaceMemberRole,
    workspaceMemberStatus: "ACTIVE" as WorkspaceMemberStatus,
    workspaceStatus: "ACTIVE" as WorkspaceStatus,
    workspaceName: "Tenant A",
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: false,
    readScope: "workspace",
  };
}

function readyWorkspace() {
  return {
    name: "Houzzat Workspace",
    twilioPhoneE164: FROM,
    twilioSubaccountSid: SUB_A,
    twilioMessagingServiceSid: MG_A,
  };
}

function testValidNanpSave() {
  const parsed = parsePhoneColumnsForWrite("647-221-4949");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.columns.phone, "(647) 221 - 4949");
  assert.equal(parsed.columns.phoneE164, "+16472214949");
  const written = phoneColumnsForWrite("4165550199");
  assert.equal(written.phone, "(416) 555 - 0199");
  assert.equal(written.phoneE164, "+14165550199");
}

function testValidE164Save() {
  const parsed = parsePhoneColumnsForWrite("+14165550199");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.columns.phone, "(416) 555 - 0199");
  assert.equal(parsed.columns.phoneE164, "+14165550199");
}

function testInvalidElevenDigitRejected() {
  const parsed = parsePhoneColumnsForWrite("64722214949");
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.error, INVALID_CONTACT_PHONE_MESSAGE);
  assert.throws(() => phoneColumnsForWrite("64722214949"));
}

function testAtomicPhoneAndE164() {
  const parsed = parsePhoneColumnsForWrite("416-555-0199");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const keys = Object.keys(parsed.columns).sort();
  assert.deepEqual(keys, ["phone", "phoneE164"]);
  assert.equal(parsed.columns.phone != null && parsed.columns.phoneE164 != null, true);

  const contact = read("src/app/api/agent/leads/contact/route.ts");
  assert.ok(contact.includes("parsePhoneColumnsForWrite(nextPhone)"));
  assert.ok(contact.includes("...parsedPhone.columns"));
  assert.equal(contact.includes("phoneColumnsForWrite("), false);
  const updateBlock = contact.split("prisma.user.update")[1]?.split("select:")[0] ?? "";
  assert.ok(updateBlock.includes("...parsedPhone.columns"));
  assert.equal(updateBlock.includes("phoneE164:"), false);
}

function testIndividualSmsDestination() {
  const current = resolveCommunicationsE164("416-555-0199", "+16473613654");
  assert.equal(current, "+14165550199");
  const eligibility = evaluateAgentSmsEligibility({
    viewerUserId: AGENT_A,
    assignedAgentId: AGENT_A,
    toE164: current,
    fromE164: FROM,
    twilioSubaccountSid: SUB_A,
    twilioMessagingServiceSid: MG_A,
    suppressed: false,
  });
  assert.equal(eligibility.enabled, true);
  assert.equal(eligibility.toE164, "+14165550199");

  const staleUnparseable = resolveCommunicationsE164(
    "64722214949",
    "+16473613654",
  );
  assert.equal(staleUnparseable, null);
  const blocked = evaluateAgentSmsEligibility({
    viewerUserId: AGENT_A,
    assignedAgentId: AGENT_A,
    toE164: staleUnparseable,
    fromE164: FROM,
    twilioSubaccountSid: SUB_A,
    twilioMessagingServiceSid: MG_A,
    suppressed: false,
  });
  assert.equal(blocked.enabled, false);
  assert.equal(blocked.reason, "NO_CUSTOMER_E164");

  const sendSrc = read("src/lib/conversations/agent-conversation-sms.ts");
  assert.ok(sendSrc.includes("resolveCommunicationsE164("));
}

async function testMassSmsDestination() {
  const decision = await classifyMassSmsLead({
    ctx: makeCtx(),
    requestedId: "lead_one",
    body: "Hello {{firstName}}",
    suppressed: false,
    lead: {
      id: "lead_one",
      workspaceId: WS_A,
      assignedAgentId: AGENT_A,
      customer: {
        name: "Jordan Customer",
        phone: "416-555-0199",
        phoneE164: "+16473613654",
      },
      workspace: readyWorkspace(),
    },
  });
  assert.equal(decision.eligible, true);
  assert.equal(decision.toE164, "+14165550199");

  const blocked = await classifyMassSmsLead({
    ctx: makeCtx(),
    requestedId: "lead_stale",
    body: "Hello",
    suppressed: false,
    lead: {
      id: "lead_stale",
      workspaceId: WS_A,
      assignedAgentId: AGENT_A,
      customer: {
        name: "Omer Ali",
        phone: "64722214949",
        phoneE164: "+16473613654",
      },
      workspace: readyWorkspace(),
    },
  });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.reason, "NO_CUSTOMER_E164");

  const massSrc = read("src/lib/sms/mass/eligibility.ts");
  assert.ok(massSrc.includes("resolveCommunicationsE164("));
}

function testAutomationDestination() {
  assert.equal(
    resolveCommunicationsE164("416-555-0199", "+16473613654"),
    "+14165550199",
  );
  const autoSrc = read("src/lib/sms/automations/execute.ts");
  assert.ok(autoSrc.includes("resolveCommunicationsE164("));
  assert.equal(autoSrc.includes("normalizeToE164(lead.customer?.phone"), false);
}

function testCallTelDestination() {
  assert.equal(
    contactTelHref("416-555-0199", "+16473613654"),
    "tel:+14165550199",
  );
  assert.equal(
    contactSmsHref("416-555-0199", "+16473613654"),
    "sms:+14165550199",
  );
  assert.equal(contactTelHref("64722214949", "+16473613654"), undefined);
  assert.equal(contactTelHref("+14165550199", "+14165550199"), "tel:+14165550199");

  const rail = read("src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx");
  assert.ok(rail.includes("contactTelHref(phone, phoneE164)"));
  assert.ok(rail.includes("contactSmsHref(phone, phoneE164)"));
  assert.equal(rail.includes("`tel:${phone}`"), false);
  const table = read("src/components/agent/LeadsTableClient.tsx");
  assert.ok(table.includes("contactTelHref(phone, phoneE164)"));
  const inbound = read("src/lib/sms/inbound.ts");
  assert.ok(inbound.includes("phoneE164: fromE164"));
}

function testWritePathsRejectUnparseable() {
  const writes = [
    "src/lib/agent/create-manual-lead.ts",
    "src/app/api/account/contact/route.ts",
    "src/app/api/account/preferences/route.ts",
    "src/app/api/agent/leads/contact/route.ts",
    "src/app/api/mobile/v2/leads/[leadId]/contact/route.ts",
    "src/app/api/valuation/route.ts",
    "src/app/api/owner/listings/route.ts",
  ];
  for (const rel of writes) {
    assert.ok(
      read(rel).includes("parsePhoneColumnsForWrite"),
      `${rel} must validate phone writes`,
    );
  }
}

async function main() {
  testValidNanpSave();
  testValidE164Save();
  testInvalidElevenDigitRejected();
  testAtomicPhoneAndE164();
  testIndividualSmsDestination();
  await testMassSmsDestination();
  testAutomationDestination();
  testCallTelDestination();
  testWritePathsRejectUnparseable();
  console.log("contact-phone-e164 selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
