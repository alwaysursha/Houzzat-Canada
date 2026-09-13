/**
 * Phase 2C-1 — CSV import Job/Row/Origin/Tag persistence.
 * Run: pnpm lead-import-persist:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyImportedLead } from "../src/lib/agent/lead-import-classify";
import {
  buildImportOriginFields,
  extraUnmappedFromDeferred,
  importRowIdempotencyKey,
} from "../src/lib/agent/lead-import-persist";
import {
  normalizeImportedTagName,
  parseImportedCrmDate,
  parseImportedCrmTags,
} from "../src/lib/agent/lead-import-metadata";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testImportedTags() {
  const tags = parseImportedCrmTags(
    "Seller, Facebook Lead; Home Valuation | 2024\nSeller",
  );
  assert.equal(tags.length, 4);
  assert.equal(tags[0]?.name, "Seller");
  assert.equal(tags[0]?.nameNormalized, "seller");
  assert.equal(tags[1]?.name, "Facebook Lead");
  assert.equal(tags[2]?.name, "Home Valuation");
  assert.equal(tags[3]?.name, "2024");

  const collapsed = parseImportedCrmTags("Seller,  SELLER  , seller");
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]?.name, "Seller");
  assert.equal(normalizeImportedTagName("  Facebook   Lead "), "facebook lead");

  const persist = read("src/lib/agent/lead-import-persist.ts");
  assert.ok(persist.includes("workspaceId: input.workspaceId"));
  assert.ok(persist.includes("nameNormalized: input.nameNormalized"));
  assert.ok(persist.includes('origin: "IMPORTED"'));
  assert.ok(!persist.includes("classifyImportedLead"));
  assert.ok(!persist.includes("isBuyer:"));
  assert.ok(!persist.includes("isSeller:"));
  assert.ok(!persist.includes("intent:"));

  const classified = classifyImportedLead("buyer", "");
  assert.equal(classified.ok, true);
  if (classified.ok) {
    assert.equal(classified.isBuyer, true);
    assert.equal(classified.isSeller, false);
  }
  const sellerTagDoesNotClassify = classifyImportedLead("buyer", "Seller");
  assert.equal(sellerTagDoesNotClassify.ok, true);
  if (sellerTagDoesNotClassify.ok) {
    assert.equal(sellerTagDoesNotClassify.isBuyer, true);
    assert.equal(sellerTagDoesNotClassify.isSeller, false);
  }
  console.log("[A] tags parse, collapse, workspace lookup, no classification... PASS");
}

function testOriginDates() {
  const valid = parseImportedCrmDate("2024-06-01");
  assert.equal(valid?.ok, true);
  if (valid?.ok) {
    assert.equal(valid.at.toISOString(), "2024-06-01T00:00:00.000Z");
  }
  const dmy = parseImportedCrmDate("13/01/2024");
  assert.equal(dmy?.ok, true);
  if (dmy?.ok) {
    assert.equal(dmy.at.toISOString(), "2024-01-13T00:00:00.000Z");
  }
  const mdy = parseImportedCrmDate("01/13/2024");
  assert.equal(mdy?.ok, true);
  if (mdy?.ok) {
    assert.equal(mdy.at.toISOString(), "2024-01-13T00:00:00.000Z");
  }
  const invalid = parseImportedCrmDate("not-a-date");
  assert.equal(invalid?.ok, false);
  if (invalid && !invalid.ok) assert.equal(invalid.raw, "not-a-date");
  const ambiguous = parseImportedCrmDate("01/02/2024");
  assert.equal(ambiguous?.ok, false);
  if (ambiguous && !ambiguous.ok) assert.equal(ambiguous.raw, "01/02/2024");

  const origin = buildImportOriginFields({
    defaultLeadType: "detect",
    leadTypeRaw: "Seller",
    dateCreatedRaw: "2023-04-01",
    dealCompletedRaw: "June 1st 2024",
    extraUnmapped: extraUnmappedFromDeferred([
      { field: "timeframe", value: "sometime", reason: "unrecognized" },
    ]),
  });
  assert.equal(origin.originalClassification, "Seller");
  assert.equal(origin.sourceCreatedAt?.toISOString(), "2023-04-01T00:00:00.000Z");
  assert.equal(origin.sourceClosedAt, null);
  assert.equal(origin.unmappedFields?.deal_completed, "June 1st 2024");
  assert.equal(origin.unmappedFields?.timeframe, "sometime");

  const importLevel = buildImportOriginFields({
    defaultLeadType: "seller",
    leadTypeRaw: "Seller",
    dateCreatedRaw: "2024-06-01",
  });
  assert.equal(importLevel.originalClassification, null);
  assert.equal(
    importLevel.sourceCreatedAt?.toISOString(),
    "2024-06-01T00:00:00.000Z",
  );

  const persist = read("src/lib/agent/lead-import-persist.ts");
  const create = read("src/lib/agent/create-manual-lead.ts");
  assert.ok(!persist.includes("prisma.lead.update"));
  assert.ok(!create.includes("createdAt:"));
  console.log("[B] origin dates + unmappedFields; Lead.createdAt untouched... PASS");
}

function testProvenanceWiring() {
  const persist = read("src/lib/agent/lead-import-persist.ts");
  const route = read("src/app/api/agent/leads/import/route.ts");

  assert.ok(persist.includes("workspaceId: input.workspaceId"));
  assert.ok(persist.includes("importedByUserId: input.importedByUserId"));
  assert.ok(persist.includes('sourceCrm: CSV_IMPORT_SOURCE_CRM'));
  assert.ok(persist.includes("checksum: null"));
  assert.ok(route.includes("createLeadImportJob"));
  assert.ok(route.includes("createLeadImportRow"));
  assert.ok(route.includes("ownership.workspaceId"));
  assert.ok(!route.includes("parsed.data.workspaceId"));
  assert.ok(route.includes('status: "CREATED"'));
  assert.ok(route.includes('status: "SKIPPED"'));
  assert.ok(route.includes('status: "FAILED"'));
  assert.ok(route.includes("leadId: result.leadId"));
  assert.ok(route.includes("leadId: existing.id"));
  assert.equal(importRowIdempotencyKey({ rowNumber: 4, email: "Ada@X.com" }), "4:ada@x.com");
  console.log("[C] job/row workspace-scoped; created/skipped/failed recorded... PASS");
}

function testNeonAndDuplicateOrigin() {
  const persist = read("src/lib/agent/lead-import-persist.ts");
  const route = read("src/app/api/agent/leads/import/route.ts");
  for (const [rel, src] of [
    ["persist", persist],
    ["route", route],
  ] as const) {
    assert.ok(!src.includes("$transaction"), `${rel} must not use $transaction`);
    assert.ok(!src.includes("updateMany"), `${rel} must not use updateMany`);
    assert.ok(!src.includes(".upsert("), `${rel} must not use upsert`);
  }
  assert.ok(persist.includes("findUnique"));
  assert.ok(persist.includes("P2002"));
  assert.ok(persist.includes("never create/update if the Lead already has an origin"));
  assert.ok(route.includes("attachImportedLeadTags"));
  assert.ok(route.includes("Open lead already exists"));
  console.log("[D] neon-safe writes + duplicate origin preserved... PASS");
}

function main() {
  console.log("\n=== LEAD IMPORT PERSISTENCE ===\n");
  testImportedTags();
  testOriginDates();
  testProvenanceWiring();
  testNeonAndDuplicateOrigin();
  console.log("\nLEAD IMPORT PERSISTENCE SELFTEST PASSED\n");
}

main();
