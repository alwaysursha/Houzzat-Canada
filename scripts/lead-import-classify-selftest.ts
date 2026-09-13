/**
 * Phase 1 Advanced Lead Import — classification + mapping foundation.
 * Run: pnpm lead-import-classify:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildImportHomeAddress,
  classifyImportedLead,
  combineImportDisplayName,
  guessLeadImportField,
  parseImportLeadType,
  parseImportOptOut,
  parseImportPurchaseTimeframe,
  shouldSetImportConsent,
  type LeadImportField,
} from "../src/lib/agent/lead-import-classify";
import {
  draftsFromMappedRows,
  SELLER_CRM_CSV_HEADERS,
  suggestLeadImportMapping,
} from "../src/lib/agent/parse-leads-csv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function mappingFor(headers: readonly string[]) {
  return suggestLeadImportMapping([...headers]);
}

function fieldMap(headers: readonly string[]) {
  const mapping = mappingFor(headers);
  return Object.fromEntries(mapping.map((m) => [m.header, m.field])) as Record<
    string,
    LeadImportField
  >;
}

function testSellerCsvHeaderRecognition() {
  const mapped = fieldMap(SELLER_CRM_CSV_HEADERS);
  assert.equal(mapped.name_first, "first_name");
  assert.equal(mapped.name_last, "last_name");
  assert.equal(mapped.email, "email");
  assert.equal(mapped.phone, "phone");
  assert.equal(mapped.address, "address");
  assert.equal(mapped.city, "city");
  assert.equal(mapped["state/province"], "province");
  assert.equal(mapped.country, "country");
  assert.equal(mapped["zip/postal code"], "postal");
  assert.equal(mapped.notes, "notes");
  assert.equal(mapped.tags, "tags");
  assert.equal(mapped.estimated_time_frame, "timeframe");
  assert.equal(mapped.source_ad, "source");
  assert.equal(mapped.date_created, "date_created");
  assert.equal(mapped.deal_completed_date, "deal_completed");
  console.log("[0] Seller CSV headers auto-map... PASS");
}

function testFirstLastCombine() {
  assert.equal(
    combineImportDisplayName({
      firstName: "John",
      lastName: "Smith",
      fullName: "Ignore Me",
    }),
    "John Smith",
  );
  const mapping = mappingFor(SELLER_CRM_CSV_HEADERS);
  const [draft] = draftsFromMappedRows(
    [
      {
        name_first: "John",
        name_last: "Smith",
        email: "john@example.com",
        phone: "519-555-0100",
        date_created: "2024-01-15",
        address: "123 Example Street",
        city: "Kitchener",
        "state/province": "Ontario",
        country: "Canada",
        "zip/postal code": "n2a 1a1",
        notes: "Prefers evenings",
        tags: "Seller, Facebook Lead, Home Valuation, 2024",
        estimated_time_frame: "1-3 months",
        source_ad: "Facebook",
        deal_completed_date: "",
      },
    ],
    mapping,
  );
  assert.ok(draft);
  assert.equal(draft.name, "John Smith");
  console.log("[1] first + last combine... PASS");
}

function testClassificationDefaults() {
  const seller = classifyImportedLead("seller");
  assert.equal(seller.ok, true);
  if (!seller.ok) return;
  assert.equal(seller.isBuyer, false);
  assert.equal(seller.isSeller, true);
  assert.equal(seller.intent, "SELLER");

  const buyer = classifyImportedLead("buyer");
  assert.equal(buyer.ok, true);
  if (!buyer.ok) return;
  assert.equal(buyer.isBuyer, true);
  assert.equal(buyer.isSeller, false);
  assert.equal(buyer.intent, "BUYER");

  const both = classifyImportedLead("both");
  assert.equal(both.ok, true);
  if (!both.ok) return;
  assert.equal(both.isBuyer, true);
  assert.equal(both.isSeller, true);
  assert.equal(both.intent, "SELLER");
  console.log("[2] Default Buyer / Seller / Buyer+Seller flags... PASS");
}

function testDetectMode() {
  const buyer = classifyImportedLead("detect", "Buyer");
  assert.equal(buyer.ok && buyer.isBuyer && !buyer.isSeller, true);

  const seller = classifyImportedLead("detect", "Seller");
  assert.equal(seller.ok && seller.isSeller && !seller.isBuyer, true);

  const both = classifyImportedLead("detect", "Buyer/Seller");
  assert.equal(both.ok && both.isBuyer && both.isSeller, true);

  const investor = classifyImportedLead("detect", "Investor");
  assert.equal(investor.ok, false);
  const parsed = parseImportLeadType("Landlord");
  assert.equal(parsed.kind, "unrecognized");
  console.log("[3] Detect mode supported vs unrecognized... PASS");
}

function testAddressAndSourcePreserved() {
  const mapping = mappingFor(SELLER_CRM_CSV_HEADERS);
  const [draft] = draftsFromMappedRows(
    [
      {
        name_first: "John",
        name_last: "Smith",
        email: "john@example.com",
        phone: "",
        date_created: "2024-01-15",
        address: "123 Example Street",
        city: "Kitchener",
        "state/province": "Ontario",
        country: "Canada",
        "zip/postal code": "n2a 1a1",
        notes: "Prefers evenings",
        tags: "Seller, Facebook Lead",
        estimated_time_frame: "1-3 months",
        source_ad: "Facebook",
        deal_completed_date: "2024-06-01",
      },
    ],
    mapping,
  );
  assert.ok(draft);
  assert.equal(
    draft.homeAddress,
    "123 Example Street, Kitchener Ontario N2A 1A1, Canada",
  );
  assert.equal(draft.utmSource, "Facebook");
  assert.equal(draft.purchaseTimeframe, "ONE_TO_THREE_MONTHS");
  assert.equal(
    buildImportHomeAddress({
      address: "123 Example Street",
      city: "Kitchener",
      province: "Ontario",
      postal: "n2a 1a1",
      country: "Canada",
    }),
    "123 Example Street, Kitchener Ontario N2A 1A1, Canada",
  );
  console.log("[4] city/address and source mapping preserved... PASS");
}

function testDeferredNotDumpedIntoNotes() {
  const mapping = mappingFor(SELLER_CRM_CSV_HEADERS);
  const [draft] = draftsFromMappedRows(
    [
      {
        name_first: "Ada",
        name_last: "Lovelace",
        email: "ada@example.com",
        phone: "",
        date_created: "2023-04-01",
        address: "1 King St",
        city: "Kitchener",
        "state/province": "ON",
        country: "CA",
        "zip/postal code": "",
        notes: "Prefers evenings",
        tags: "Seller, Facebook Lead, Home Valuation, 2024",
        estimated_time_frame: "sometime",
        source_ad: "KVCore",
        deal_completed_date: "2024-06-01",
      },
    ],
    mapping,
  );
  assert.ok(draft);
  assert.equal(draft.notes, "Prefers evenings");
  assert.equal(draft.notes.includes("Facebook Lead"), false);
  assert.equal(draft.notes.includes("2023-04-01"), false);
  assert.equal(draft.notes.includes("2024-06-01"), false);
  const fields = draft.deferred.map((d) => d.field).sort();
  assert.ok(fields.includes("tags"));
  assert.ok(fields.includes("date_created"));
  assert.ok(fields.includes("deal_completed"));
  assert.ok(fields.includes("timeframe"));
  console.log("[5] unsupported mapped data not dumped into notes... PASS");
}

function testConsentAndOptOut() {
  assert.equal(
    shouldSetImportConsent({ asserted: false, optedOut: false }),
    false,
  );
  assert.equal(
    shouldSetImportConsent({ asserted: true, optedOut: false }),
    true,
  );
  assert.equal(
    shouldSetImportConsent({ asserted: true, optedOut: true }),
    false,
  );
  assert.equal(parseImportOptOut(""), false);
  assert.equal(parseImportOptOut("unsubscribed"), true);
  assert.equal(parseImportOptOut("yes"), true);
  assert.equal(parseImportOptOut("no"), false);
  console.log("[6] consent defaults off; assertion + opt-out win... PASS");
}

function testAliasesAndTimeframe() {
  const taken = new Set<LeadImportField>();
  assert.equal(guessLeadImportField("First Name", taken), "first_name");
  taken.add("first_name");
  assert.equal(guessLeadImportField("Last Name", taken), "last_name");
  assert.equal(parseImportPurchaseTimeframe("NOW"), "NOW");
  assert.equal(parseImportPurchaseTimeframe("asap"), "NOW");
  assert.equal(
    parseImportPurchaseTimeframe("6-12 months"),
    "SIX_TO_TWELVE_MONTHS",
  );
  assert.equal(parseImportPurchaseTimeframe("unknown horizon"), null);
  console.log("[7] aliases + safe timeframe parse... PASS");
}

function testWiringNoConsentDefaultAndNoBothIntent() {
  const classify = read("src/lib/agent/lead-import-classify.ts");
  const create = read("src/lib/agent/create-manual-lead.ts");
  const route = read("src/app/api/agent/leads/import/route.ts");
  const modal = read("src/components/agent/LeadImportModal.tsx");

  assert.ok(classify.includes("resolveLeadIntent"));
  assert.ok(classify.includes("@/lib/agent/lead-intent"));
  assert.ok(!classify.includes("@/lib/agent/lead-intake"));
  assert.ok(!classify.includes("LeadIntent.BOTH"));
  assert.ok(!classify.includes('"BOTH"'));

  assert.ok(create.includes("assertCommunicationConsent"));
  assert.ok(create.includes("isBuyer"));
  assert.ok(create.includes("isSeller"));
  assert.ok(create.includes("utmSource"));
  assert.ok(create.includes("homeAddress"));

  assert.ok(route.includes("defaultLeadType"));
  assert.ok(route.includes("assertCommunicationConsent"));
  assert.ok(route.includes("resolveLeadImportOwnership(ctx)"));
  assert.ok(!route.includes("resolveLeadCrmOwnership"));

  assert.ok(modal.includes("Default Lead Type"));
  assert.ok(modal.includes("transferred from my"));
  assert.ok(modal.includes("existing CRM"));
  assert.ok(modal.includes("assertConsent"));
  assert.ok(modal.includes("useState(false)"));
  assert.ok(!modal.includes("workspaceId"));
  console.log("[8] wiring: no BOTH intent, consent default off, isolation... PASS");
}

function main() {
  console.log("\n=== LEAD IMPORT CLASSIFY + MAPPING ===\n");
  testSellerCsvHeaderRecognition();
  testFirstLastCombine();
  testClassificationDefaults();
  testDetectMode();
  testAddressAndSourcePreserved();
  testDeferredNotDumpedIntoNotes();
  testConsentAndOptOut();
  testAliasesAndTimeframe();
  testWiringNoConsentDefaultAndNoBothIntent();
  console.log("\nLEAD IMPORT CLASSIFY + MAPPING SELFTEST PASSED\n");
}

main();
