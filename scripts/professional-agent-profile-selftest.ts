/**
 * Mandatory professional agent profiles. No database and no sends.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAppointmentCustomerEmail } from "../src/lib/email/appointment-customer-email";
import {
  renderAgentMessageEmail,
  renderPriceReductionEmail,
  renderSavedSearchDigestEmail,
} from "../src/lib/email/templates";
import { buildAgentEmailSignature } from "../src/lib/email/tenant-email-brand";
import {
  designationOptionsForJurisdiction,
  evaluateProfessionalAgentProfile,
  parseProfessionalOnboarding,
  type ProfessionalProfileSnapshot,
} from "../src/lib/agent/professional-profile";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function snapshot(partial: Partial<ProfessionalProfileSnapshot> = {}): ProfessionalProfileSnapshot {
  return {
    firstName: "Jordan",
    lastName: "Lee",
    email: "jordan.lee@brokerage.test",
    phone: "416-555-1234",
    designation: "Sales Representative",
    brokerageName: "Right at Home Realty Brokerage",
    jurisdiction: "CA-ON",
    recoLicenseNumber: "12345678",
    recoLicenseExpiresAt: "2027-06-15",
    registrationNumber: null,
    ...partial,
  };
}

function testOntarioAndOtherJurisdictions() {
  const ontario = evaluateProfessionalAgentProfile(snapshot());
  assert.equal(ontario.complete, true);
  assert.equal(ontario.onboarded, true);
  assert.deepEqual(designationOptionsForJurisdiction("CA-ON").includes("Sales Representative"), true);
  assert.equal(designationOptionsForJurisdiction("CA-BC").includes("Sales Representative"), false);
  assert.equal(designationOptionsForJurisdiction(null).includes("Broker of Record"), false);

  const missingLicence = evaluateProfessionalAgentProfile(
    snapshot({
      jurisdiction: null,
      recoLicenseNumber: "",
      recoLicenseExpiresAt: "",
      registrationNumber: "",
    }),
  );
  assert.equal(missingLicence.onboarded, true);
  assert.equal(missingLicence.missing.includes("jurisdiction"), false);
  assert.equal(missingLicence.missing.includes("recoLicenseNumber"), false);
  assert.equal(missingLicence.missing.includes("recoLicenseExpiresAt"), false);
  assert.equal(missingLicence.missing.includes("registrationNumber"), false);

  const britishColumbia = evaluateProfessionalAgentProfile(
    snapshot({
      jurisdiction: "CA-BC",
      designation: "Representative",
      recoLicenseNumber: null,
      recoLicenseExpiresAt: null,
      registrationNumber: null,
    }),
  );
  assert.equal(britishColumbia.onboarded, true);

  const badExpiry = evaluateProfessionalAgentProfile(
    snapshot({ recoLicenseExpiresAt: "15/06/2027" }),
  );
  assert.equal(badExpiry.onboarded, true);
  assert.equal(badExpiry.missing.includes("recoLicenseExpiresAt"), false);
  assert.match(badExpiry.fieldErrors.recoLicenseExpiresAt ?? "", /valid registration expiry/);

  const badJurisdiction = evaluateProfessionalAgentProfile(snapshot({ jurisdiction: "CA-XX" }));
  assert.equal(badJurisdiction.missing.includes("jurisdiction"), false);
  assert.match(badJurisdiction.fieldErrors.jurisdiction ?? "", /licensing jurisdiction/);
}

function testExistingIncompleteStaysUnboarded() {
  const legacy = evaluateProfessionalAgentProfile(
    snapshot({
      designation: "Sales Representative",
      jurisdiction: null,
      recoLicenseNumber: null,
      recoLicenseExpiresAt: null,
    }),
  );
  assert.equal(legacy.onboarded, true);
  assert.equal(legacy.fieldErrors.designation, undefined);
  assert.equal(legacy.missing.includes("jurisdiction"), false);
  const layout = readFileSync(join(root, "src/app/(agent)/agent/layout.tsx"), "utf8");
  assert.ok(layout.includes("ProfessionalProfileNotice"));
  assert.equal(layout.includes('redirect("/agent/profile")'), false);
}

function testInviteRefusesIncompleteProfiles() {
  const incomplete = parseProfessionalOnboarding(
    {
      firstName: "Saad",
      lastName: "Qureshi",
      email: "saad@highoctaneniagara.ca",
      phone: "905-555-0100",
      designation: "",
      jurisdiction: "CA-ON",
      recoLicenseNumber: "",
      recoLicenseExpiresAt: "",
    },
    "Right at Home Realty Brokerage",
  );
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) {
    assert.ok(incomplete.missingLabels.includes("Professional designation"));
    assert.equal(incomplete.data, undefined);
  }

  const otherTenant = parseProfessionalOnboarding(
    {
      firstName: "Jordan",
      lastName: "Lee",
      email: "jordan.lee@brokerage.test",
      phone: "416-555-1234",
      designation: "Representative",
      jurisdiction: "",
      recoLicenseNumber: "",
      recoLicenseExpiresAt: "",
      registrationNumber: "",
    },
    "Other Brokerage",
  );
  assert.equal(otherTenant.ok, true);
  if (otherTenant.ok) {
    assert.equal(otherTenant.data.registrationJurisdiction, null);
    assert.equal(otherTenant.data.recoLicenseNumber, null);
    assert.equal(otherTenant.data.recoLicenseExpiresAt, null);
    assert.equal(otherTenant.data.designation, "Representative");
  }

  const voluntaryLicence = parseProfessionalOnboarding(
    {
      firstName: "Jordan",
      lastName: "Lee",
      email: "jordan.lee@brokerage.test",
      phone: "416-555-1234",
      designation: "Sales Representative",
      jurisdiction: "CA-ON",
      recoLicenseNumber: "12345678",
      recoLicenseExpiresAt: "",
    },
    "Right at Home Realty Brokerage",
  );
  assert.equal(voluntaryLicence.ok, true);
  if (voluntaryLicence.ok) {
    assert.equal(voluntaryLicence.data.recoLicenseNumber, "12345678");
    assert.equal(voluntaryLicence.data.recoLicenseExpiresAt, null);
  }

  const invalidExpiry = parseProfessionalOnboarding(
    {
      firstName: "Jordan",
      lastName: "Lee",
      email: "jordan.lee@brokerage.test",
      phone: "416-555-1234",
      designation: "Sales Representative",
      recoLicenseExpiresAt: "not-a-date",
    },
    "Right at Home Realty Brokerage",
  );
  assert.equal(invalidExpiry.ok, false);

  const wrongBrokerage = parseProfessionalOnboarding(
    {
      firstName: "Jordan",
      lastName: "Lee",
      email: "jordan.lee@brokerage.test",
      phone: "416-555-1234",
      designation: "Sales Representative",
      jurisdiction: "CA-ON",
      recoLicenseNumber: "12345678",
      recoLicenseExpiresAt: "2027-06-15",
    },
    "",
  );
  assert.equal(wrongBrokerage.ok, false);
  if (!wrongBrokerage.ok) assert.ok(wrongBrokerage.missingLabels.includes("Brokerage name"));
}

function testSignatureUsesSavedDetails() {
  const signature = buildAgentEmailSignature({
    workspaceId: "ws_a",
    agent: {
      userId: "owner",
      name: "Saad Qureshi",
      email: "saad@highoctaneniagara.ca",
      phone: "905-555-0100",
      image: null,
      designation: "Sales Representative",
    },
    displayName: "HIGH OCTANE Real Estate",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: "Right at Home Realty Brokerage",
    primaryColor: "#071629",
  });
  assert.match(signature.text, /Saad Qureshi/);
  assert.match(signature.text, /Sales Representative/);
  assert.match(signature.text, /Right at Home Realty Brokerage/);
  assert.match(signature.text, /saad@highoctaneniagara.ca/);
  assert.match(signature.text, /905-555-0100/);
  assert.doesNotMatch(signature.text, /Your agent|Title|Licence|placeholder/i);

  const omitted = buildAgentEmailSignature({
    workspaceId: "ws_a",
    agent: {
      userId: "owner",
      name: "Saad Qureshi",
      email: "saad@highoctaneniagara.ca",
      phone: "905-555-0100",
      image: null,
      designation: null,
    },
    displayName: "HIGH OCTANE Real Estate",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: "Right at Home Realty Brokerage",
    primaryColor: "#071629",
  });
  assert.doesNotMatch(omitted.text, /Sales Representative/);

  const fallback = buildAgentEmailSignature({
    workspaceId: "ws_b",
    agent: null,
    displayName: "Other Tenant",
    contactPhone: "416-555-0199",
    senderDisplayName: "Other Tenant",
    brokerageRegisteredName: "Other Brokerage",
    primaryColor: "#111111",
  });
  assert.doesNotMatch(fallback.text, /Saad Qureshi|Right at Home/);
  assert.match(fallback.text, /Other Brokerage/);

  const chrome = {
    brandLabel: "HIGH OCTANE Real Estate",
    brandPrimaryColor: "#071629",
    brandWebsiteUrl: "https://highoctaneniagara.ca",
    presentation: "high-octane" as const,
    agentSignatureHtml: signature.html,
    agentSignatureText: signature.text,
  };
  const appointment = renderAppointmentCustomerEmail({
    recipientName: "Test",
    type: "SHOWING",
    status: "REQUESTED",
    startsAt: null,
    chrome,
    websiteUrl: "https://highoctaneniagara.ca",
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
    assert.match(rendered.html, /Sales Representative/);
    assert.match(rendered.text, /saad@highoctaneniagara.ca/);
  }
  assert.match(appointment.html, /not confirmed yet/);
}

function main() {
  testOntarioAndOtherJurisdictions();
  testExistingIncompleteStaysUnboarded();
  testInviteRefusesIncompleteProfiles();
  testSignatureUsesSavedDetails();
  console.log("professional-agent-profile-selftest: OK");
}

main();
