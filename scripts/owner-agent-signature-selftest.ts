/**
 * Owner agent profiles and signature resolution. No database and no sends.
 */
import assert from "node:assert/strict";
import { planOwnerAgentProfile } from "../src/lib/agent/ensure-owner-agent-profile";
import { renderAppointmentCustomerEmail } from "../src/lib/email/appointment-customer-email";
import {
  renderAgentMessageEmail,
  renderPriceReductionEmail,
  renderSavedSearchDigestEmail,
} from "../src/lib/email/templates";
import {
  buildAgentEmailSignature,
  resolveWorkspaceEmailBrand,
  toEmailBrandChrome,
  type TenantEmailAgentIdentity,
  type TenantEmailBrandDeps,
} from "../src/lib/email/tenant-email-brand";

const base = {
  membershipActive: true,
  isPrimaryAgent: false,
  assignedLeadCount: 0,
  workspaceHasOtherActiveAgentProfile: false,
  hasProfile: false,
  name: "Saad Qureshi",
  phone: "905-555-0100",
  publicDesignation: null,
};

function testPlans() {
  const created = planOwnerAgentProfile({ ...base, role: "OWNER", isPrimaryAgent: true });
  assert.equal(created.action, "create");
  if (created.action === "create") {
    assert.equal(created.firstName, "Saad");
    assert.equal(created.lastName, "Qureshi");
    assert.equal(created.phone, "905-555-0100");
    assert.equal(created.designation, null);
  }

  const titled = planOwnerAgentProfile({
    ...base,
    role: "OWNER",
    isPrimaryAgent: true,
    publicDesignation: "Broker",
  });
  assert.equal(titled.action, "create");
  if (titled.action === "create") assert.equal(titled.designation, "Broker");

  assert.deepEqual(
    planOwnerAgentProfile({ ...base, role: "OWNER", hasProfile: true, name: "Changed Name" }),
    { action: "unchanged" },
  );
  assert.equal(
    planOwnerAgentProfile({ ...base, role: "AGENT" }).action,
    "skip",
  );
  assert.equal(
    planOwnerAgentProfile({
      ...base,
      role: "OWNER",
      workspaceHasOtherActiveAgentProfile: true,
    }).action,
    "skip",
  );
  const assigned = planOwnerAgentProfile({
    ...base,
    role: "OWNER",
    assignedLeadCount: 2,
    workspaceHasOtherActiveAgentProfile: true,
    publicDesignation: "Should not copy",
  });
  assert.equal(assigned.action, "create");
  if (assigned.action === "create") assert.equal(assigned.designation, null);
}

function owner(): TenantEmailAgentIdentity {
  return {
    userId: "owner",
    name: "Saad Qureshi",
    email: "owner@example.com",
    phone: "905-555-0100",
    image: null,
    designation: "Sales Representative",
  };
}

function otherAgent(): TenantEmailAgentIdentity {
  return {
    userId: "agent_b",
    name: "Other Agent",
    email: "other@example.com",
    phone: "416-555-0199",
    image: null,
    designation: "Salesperson",
  };
}

function deps(agents: Map<string, TenantEmailAgentIdentity | null>): TenantEmailBrandDeps {
  return {
    loadBranding: async () => null,
    loadEmailIdentity: async () => null,
    loadProfessionalIdentity: async (workspaceId) =>
      workspaceId === "ws_a"
        ? { brokerageRegisteredName: "Right at Home Realty Brokerage" }
        : { brokerageRegisteredName: "Other Brokerage" },
    loadAgentInWorkspace: async (workspaceId, userId) =>
      workspaceId === "ws_a" ? agents.get(userId) ?? null : null,
    loadAssignedAgentForLead: async (workspaceId, leadId) => {
      if (workspaceId !== "ws_a") return null;
      return leadId === "lead_other" ? otherAgent() : owner();
    },
    loadAssignedAgentForCustomer: async () => null,
    loadAgentEmailHeadshotAssociation: async () => null,
    resolveWebsiteUrl: async (workspaceId) =>
      workspaceId === "ws_a" ? "https://highoctaneniagara.ca" : "https://other.example",
    loadWorkspaceSlug: async (workspaceId) =>
      workspaceId === "ws_a" ? "high-octane-real-estate" : "other-tenant",
  };
}

async function testResolution() {
  const agents = new Map<string, TenantEmailAgentIdentity | null>([
    ["owner", owner()],
    ["agent_b", otherAgent()],
  ]);
  const brand = await resolveWorkspaceEmailBrand(
    { workspaceId: "ws_a", preferredAgentUserId: "owner" },
    deps(agents),
  );
  assert.ok(brand);
  assert.equal(brand.agent?.name, "Saad Qureshi");
  assert.match(brand.signatureText, /Right at Home Realty Brokerage/);
  assert.match(brand.signatureText, /owner@example.com/);
  assert.match(brand.signatureText, /Sales Representative/);
  assert.doesNotMatch(brand.signatureText, /Salesperson/);
  assert.equal(brand.presentation, "high-octane");

  const assigned = await resolveWorkspaceEmailBrand(
    { workspaceId: "ws_a", leadId: "lead_other" },
    deps(agents),
  );
  assert.equal(assigned?.agent?.name, "Other Agent");
  assert.doesNotMatch(assigned?.signatureText ?? "", /Saad Qureshi/);

  const missing = await resolveWorkspaceEmailBrand(
    { workspaceId: "ws_a", preferredAgentUserId: "missing" },
    deps(agents),
  );
  assert.equal(missing?.agent, null);
  assert.match(missing?.signatureText ?? "", /Right at Home Realty Brokerage/);
  assert.doesNotMatch(missing?.signatureText ?? "", /owner@example.com/);

  const foreign = await resolveWorkspaceEmailBrand(
    { workspaceId: "ws_b", preferredAgentUserId: "owner" },
    deps(agents),
  );
  assert.equal(foreign?.agent, null);
  assert.doesNotMatch(foreign?.signatureText ?? "", /Saad Qureshi/);
  assert.doesNotMatch(foreign?.signatureHtml ?? "", /#071629/);

  const chrome = toEmailBrandChrome(brand!);
  const appointment = renderAppointmentCustomerEmail({
    recipientName: "Test",
    type: "SHOWING",
    status: "REQUESTED",
    startsAt: null,
    chrome,
    websiteUrl: brand!.websiteUrl,
  });
  const alert = renderPriceReductionEmail({
    name: "Test",
    addressLine: "Email fixture",
    city: "Fixture",
    mlsNumber: "FIXTURE",
    oldPrice: 1,
    newPrice: 1,
    listingUrl: "https://example.com/email-fixture",
    ...chrome,
  });
  const digest = renderSavedSearchDigestEmail({
    name: "Test",
    searchName: "Fixture",
    listings: [],
    searchUrl: "https://example.com/email-fixture",
    ...chrome,
  });
  const message = renderAgentMessageEmail({
    name: "Test",
    subject: "Fixture",
    body: "Fixture note",
    ...chrome,
  });
  for (const rendered of [appointment, alert, digest, message]) {
    assert.match(rendered.html, /Saad Qureshi/);
    assert.match(rendered.html, /Sales Representative/);
    assert.match(rendered.text, /Right at Home Realty Brokerage/);
    assert.match(rendered.html, /#071629/);
  }
  assert.match(appointment.html, /not confirmed yet/);

  const omitted = buildAgentEmailSignature({
    workspaceId: "ws_a",
    agent: { ...owner(), email: null, phone: null, designation: null, image: null },
    displayName: "HIGH OCTANE Real Estate",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: "Right at Home Realty Brokerage",
    primaryColor: "#071629",
  });
  assert.doesNotMatch(omitted.text, /@/);
  assert.doesNotMatch(omitted.html, /tel:/);
  assert.match(omitted.text, /Saad Qureshi/);
}

async function main() {
  testPlans();
  await testResolution();
  console.log("owner-agent-signature-selftest: OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "selftest failed");
  process.exit(1);
});
