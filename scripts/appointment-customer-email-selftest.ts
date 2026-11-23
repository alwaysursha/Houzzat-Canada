/**
 * Appointment customer mail: status wording, tenant chrome, and signature.
 * Does not send email and does not read production leads.
 */
import assert from "node:assert/strict";
import {
  appointmentStatusCopy,
  customerEmailsForAppointmentStatus,
  renderAppointmentCustomerEmail,
  renderLeadRequestAcknowledgement,
} from "../src/lib/email/appointment-customer-email";
import { buildAgentEmailSignature } from "../src/lib/email/tenant-email-brand";
import type { EmailBrandChrome } from "../src/lib/email/tenant-email-brand";

const WHEN = new Date("2026-11-23T15:00:00.000Z");

function chrome(input: Partial<EmailBrandChrome> & Pick<EmailBrandChrome, "brandLabel">): EmailBrandChrome {
  return {
    brandPrimaryColor: "#047857",
    brandWebsiteUrl: "https://houzzat.com",
    presentation: null,
    footerNote: "Houzzat",
    agentSignatureHtml: `<table data-houzzat-agent-signature="1"><tr><td>Alex Agent</td></tr></table>`,
    agentSignatureText: "Alex Agent\nSales Representative\n647-555-0100\nalex@example.com",
    ...input,
  };
}

const houzzat = chrome({ brandLabel: "Houzzat" });
const highOctane = chrome({
  brandLabel: "HIGH OCTANE Real Estate",
  brandPrimaryColor: "#071629",
  brandWebsiteUrl: "https://highoctaneniagara.ca",
  presentation: "high-octane",
  footerNote: "HIGH OCTANE Real Estate",
  agentSignatureText: "Alex Agent\nSales Representative\n905-555-0100",
});

function testRequestedIsNotConfirmed() {
  const rendered = renderAppointmentCustomerEmail({
    recipientName: "Test Recipient",
    type: "SHOWING",
    status: "REQUESTED",
    startsAt: null,
    listingMls: "X0001",
    chrome: highOctane,
    websiteUrl: "https://highoctaneniagara.ca",
  });
  assert.equal(rendered.subject, "We received your Showing request");
  assert.match(rendered.html, /Showing request received/);
  assert.match(rendered.html, /not confirmed yet/);
  assert.doesNotMatch(rendered.subject, /is confirmed/i);
  assert.doesNotMatch(rendered.html, /Your appointment is confirmed/);
  assert.match(rendered.html, /Not scheduled yet/);
  assert.match(rendered.html, /MLS® X0001/);
  assert.doesNotMatch(rendered.html, /123 Main/);
  assert.match(rendered.html, /#071629/);
  assert.match(rendered.html, /Alex Agent/);
  assert.match(rendered.text, /Alex Agent/);
  assert.equal(customerEmailsForAppointmentStatus("REQUESTED"), true);
  assert.equal(customerEmailsForAppointmentStatus("COMPLETED"), false);
}

function testConfirmedUsesRealTimeAndLocation() {
  const rendered = renderAppointmentCustomerEmail({
    recipientName: "Test Recipient",
    type: "VALUATION_CALL",
    status: "CONFIRMED",
    startsAt: WHEN,
    endsAt: new Date("2026-11-23T16:00:00.000Z"),
    locationLabel: "Fixture meeting room",
    videoJoinUrl: "https://example.com/join/fixture",
    chrome: houzzat,
    replyTo: "alex@example.com",
    websiteUrl: "https://houzzat.com",
  });
  assert.equal(rendered.subject, "Your Valuation call is confirmed");
  assert.match(rendered.html, /Valuation call confirmed/);
  assert.match(rendered.html, /Fixture meeting room/);
  assert.match(rendered.html, /https:\/\/example.com\/join\/fixture/);
  assert.match(rendered.html, /https:\/\/houzzat.com\/account/);
  assert.match(rendered.text, /EST/);
  assert.doesNotMatch(rendered.html, /high-octane|071629/i);
  assert.doesNotMatch(rendered.html, /MLS®/);
}

function testOtherTenantDoesNotUseHighOctaneShell() {
  const rendered = renderLeadRequestAcknowledgement({
    recipientName: "Test Recipient",
    locationLabel: "Fixture property",
    chrome: houzzat,
    websiteUrl: "https://houzzat.com",
  });
  assert.match(rendered.html, /not an appointment confirmation/);
  assert.match(rendered.html, /Fixture property/);
  assert.doesNotMatch(rendered.html, /#071629/);
  assert.match(rendered.text, /Alex Agent/);
}

function testStatusSwitchIsExhaustive() {
  const labels = ["REQUESTED", "CONFIRMED", "RESCHEDULED", "CANCELLED", "COMPLETED"] as const;
  for (const status of labels) {
    const copy = appointmentStatusCopy(status, "Showing");
    if (status !== "CONFIRMED") {
      assert.doesNotMatch(copy.subject, /is confirmed/i);
    }
  }
}

function testFallbackOmitsInventedBrokerage() {
  const sig = buildAgentEmailSignature({
    workspaceId: "ws_test",
    agent: null,
    displayName: "Brand Name",
    contactPhone: null,
    senderDisplayName: "Saved Sender",
    brokerageRegisteredName: null,
    fallbackTitle: null,
    primaryColor: "#047857",
  });
  assert.match(sig.text, /Saved Sender/);
  assert.doesNotMatch(sig.text, /Brand Name/);
  assert.doesNotMatch(sig.text, /Sales Representative/);
}

testRequestedIsNotConfirmed();
testConfirmedUsesRealTimeAndLocation();
testOtherTenantDoesNotUseHighOctaneShell();
testStatusSwitchIsExhaustive();
testFallbackOmitsInventedBrokerage();
console.log("appointment-customer-email-selftest: OK");
