/**
 * Lead desk / Lead Profile contact validity icons.
 * Run: pnpm lead-contact-validity:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const table = read("src/components/agent/LeadsTableClient.tsx");
const rail = read("src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx");
const fields = read("src/components/agent/lead-profile-v2/contact-fields.tsx");
const icon = read("src/components/agent/ContactValidityIcon.tsx");
const shell = read("src/lib/agent/lead-profile-v2/load-shell.ts");

assert.ok(icon.includes("CircleCheck"));
assert.ok(icon.includes("TriangleAlert"));
assert.ok(icon.includes("text-[#6a9e7d]"));
assert.ok(icon.includes("text-[#d4a574]"));

assert.ok(table.includes("ContactValidityIcon"));
assert.ok(table.includes("contactVerified(lead, \"email\")"));
assert.ok(table.includes("contactVerified(lead, \"phone\")"));
assert.ok(table.includes("emailVerified"));
assert.ok(table.includes("phoneVerified"));

assert.ok(fields.includes("validityVerified"));
assert.ok(fields.includes("<span className={valueClass}>{shown}</span>"));
const shownIdx = fields.indexOf("<span className={valueClass}>{shown}</span>");
const afterShown = fields.slice(shownIdx);
assert.ok(
  afterShown.includes("ContactValidityIcon"),
  "validity icon must follow the phone/email value",
);
assert.ok(rail.includes("validityVerified={Boolean(data.lead.customer?.phoneVerified)}"));
assert.ok(rail.includes("validityVerified={Boolean(data.lead.customer?.emailVerified)}"));
assert.ok(rail.includes("gap-3.5"));
assert.ok(rail.includes("phoneUpdateRequestedAt"));
assert.ok(rail.includes("emailUpdateRequestedAt"));
assert.ok(
  rail.includes("-translate-x-[calc(100%+0.5rem)]"),
  "modal call/text/email rail must sit fully outside the white panel",
);
assert.equal(rail.includes("-left-1"), false);
assert.equal(rail.includes("md:-left-3"), false);
assert.ok(shell.includes("phoneVerifiedAt: true"));
assert.ok(shell.includes("phoneVerified: Boolean(lead.customer.phoneVerifiedAt)"));

console.log("lead-contact-validity-selftest: ok");
