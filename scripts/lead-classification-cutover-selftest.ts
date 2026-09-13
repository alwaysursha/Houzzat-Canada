/**
 * Phase 2B-2 — CRM classification cutover onto Lead.isBuyer / Lead.isSeller.
 * Run: pnpm lead-classification-cutover:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  finalizeWritableLeadClassification,
  nextWritableLeadClassification,
  resolveDisplayedLeadClassification,
} from "../src/lib/agent/lead-classification";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function sliceBetween(src: string, start: string, end: string) {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing ${start}`);
  assert.ok(to > from, `missing ${end} after ${start}`);
  return src.slice(from, to);
}

function testSameEmailWorkspaceIsolation() {
  const user = { isBuyer: false, isSeller: true };
  const leadA = {
    isBuyer: false,
    isSeller: true,
    intent: "SELLER" as const,
  };
  const leadB = {
    isBuyer: true,
    isSeller: false,
    intent: "BUYER" as const,
  };

  const a = resolveDisplayedLeadClassification(leadA);
  const b = resolveDisplayedLeadClassification(leadB);

  assert.equal(a.isBuyer, false);
  assert.equal(a.isSeller, true);
  assert.equal(a.intent, "SELLER");
  assert.equal(b.isBuyer, true);
  assert.equal(b.isSeller, false);
  assert.equal(b.intent, "BUYER");
  assert.notEqual(a.isSeller, b.isSeller);
  void user;
  console.log("[A] same email, workspace A seller / B buyer... PASS");
}

function testBuyerPlusSellerWrites() {
  const both = finalizeWritableLeadClassification({
    isBuyer: true,
    isSeller: true,
  });
  assert.equal(both.isBuyer, true);
  assert.equal(both.isSeller, true);
  assert.equal(both.intent, "SELLER");

  const fromBuyerThenSeller = nextWritableLeadClassification({
    current: { isBuyer: true, isSeller: false, intent: "BUYER" },
    patch: { isSeller: true },
  });
  assert.equal(fromBuyerThenSeller.isBuyer, true);
  assert.equal(fromBuyerThenSeller.isSeller, true);
  assert.equal(fromBuyerThenSeller.intent, "SELLER");

  const neither = finalizeWritableLeadClassification({
    isBuyer: false,
    isSeller: false,
  });
  assert.equal(neither.isBuyer, true);
  assert.equal(neither.isSeller, false);
  assert.equal(neither.intent, "BUYER");
  console.log("[B] buyer+seller → both Lead flags, intent SELLER... PASS");
}

function testLegacyNullFallsBackToIntentNotUser() {
  const userBuyer = { isBuyer: true, isSeller: false };
  const sellerIntent = resolveDisplayedLeadClassification({
    isBuyer: null,
    isSeller: null,
    intent: "SELLER",
  });
  const buyerIntent = resolveDisplayedLeadClassification({
    isBuyer: null,
    isSeller: null,
    intent: "BUYER",
  });
  assert.equal(sellerIntent.isBuyer, false);
  assert.equal(sellerIntent.isSeller, true);
  assert.equal(sellerIntent.intent, "SELLER");
  assert.equal(buyerIntent.isBuyer, true);
  assert.equal(buyerIntent.isSeller, false);
  assert.equal(buyerIntent.intent, "BUYER");
  assert.notEqual(sellerIntent.isSeller, userBuyer.isSeller);

  const helper = read("src/lib/agent/lead-classification.ts");
  assert.ok(helper.includes("Never falls back to User.isBuyer"));

  const crmReadFiles = [
    "src/app/(agent)/agent/leads/page.tsx",
    "src/app/api/agent/leads/list/route.ts",
    "src/lib/agent/lead-profile-v2/load-shell.ts",
    "src/lib/agent/lead-summary.ts",
    "src/lib/agent/launchpad-deferred.ts",
    "src/app/api/mobile/v2/leads/route.ts",
    "src/app/api/mobile/v2/leads/[leadId]/route.ts",
  ];
  for (const rel of crmReadFiles) {
    const src = read(rel);
    assert.ok(
      src.includes("displayedCrmClassification"),
      `${rel} must overlay CRM classification from the Lead`,
    );
    assert.ok(
      !src.includes("isBuyer: lead.customer.isBuyer") &&
        !src.includes("isBuyer: l.customer.isBuyer"),
      `${rel} must not read User.isBuyer for CRM chips`,
    );
  }
  console.log("[C] legacy NULL Lead flags fallback from intent, never User... PASS");
}

function testImportWritesLeadOnly() {
  const create = read("src/lib/agent/create-manual-lead.ts");
  const route = read("src/app/api/agent/leads/import/route.ts");
  const classify = read("src/lib/agent/lead-import-classify.ts");

  assert.ok(route.includes("isBuyer: classification.isBuyer"));
  assert.ok(route.includes("isSeller: classification.isSeller"));
  assert.ok(create.includes("finalizeWritableLeadClassification"));
  assert.ok(!create.includes("stampClassification"));

  const userCreate = sliceBetween(
    create,
    "prisma.user.create",
    "prisma.user.update",
  );
  const userUpdate = sliceBetween(
    create,
    "prisma.user.update",
    "prisma.lead.create",
  );
  const leadCreate = create.slice(create.indexOf("prisma.lead.create"));
  assert.ok(!userCreate.includes("isBuyer"));
  assert.ok(!userCreate.includes("isSeller"));
  assert.ok(!userUpdate.includes("isBuyer"));
  assert.ok(!userUpdate.includes("isSeller"));
  assert.ok(leadCreate.includes("isBuyer: classification.isBuyer"));
  assert.ok(leadCreate.includes("isSeller: classification.isSeller"));
  assert.ok(classify.includes("resolveLeadIntent"));
  console.log("[D] import classification writes Lead only... PASS");
}

function testManualAddLeadWritesLeadOnly() {
  const create = read("src/lib/agent/create-manual-lead.ts");
  const route = read("src/app/api/agent/leads/route.ts");
  const postFn = route.slice(route.indexOf("export async function POST"));
  assert.ok(postFn.includes("createManualLead"));
  assert.ok(!postFn.includes("isBuyer"));
  assert.ok(!postFn.includes("isSeller"));
  assert.ok(create.includes("isBuyer: input.isBuyer ?? true"));
  assert.ok(create.includes("isSeller: input.isSeller ?? false"));
  assert.ok(create.includes("isBuyer: classification.isBuyer"));
  assert.ok(!create.includes("stampClassification"));

  const flags = read("src/app/api/agent/leads/profile-flags/route.ts");
  const mobileFlags = read(
    "src/app/api/mobile/v2/leads/[leadId]/profile-flags/route.ts",
  );
  for (const [rel, src] of [
    ["web profile-flags", flags],
    ["mobile profile-flags", mobileFlags],
  ] as const) {
    assert.ok(
      src.includes("nextWritableLeadClassification"),
      `${rel} must write derived Lead classification`,
    );
    assert.ok(
      !src.includes("isBuyer: nextBuyer"),
      `${rel} must not stamp User.isBuyer`,
    );
    const userIdx = src.indexOf("prisma.user.update");
    assert.ok(userIdx >= 0, `${rel} still updates purchaseTimeframe on User`);
    const userEnd = src.indexOf("});", userIdx) + 3;
    const userBlock = src.slice(userIdx, userEnd);
    assert.ok(userBlock.includes("purchaseTimeframe"));
    assert.ok(!userBlock.includes("isBuyer"));
    assert.ok(!userBlock.includes("isSeller"));
    assert.ok(src.includes("isBuyer: next.isBuyer"));
    assert.ok(src.includes("intent: next.intent"));
  }
  console.log("[E] manual Add Lead + CRM toggles write Lead only... PASS");
}

function main() {
  console.log("\n=== LEAD CLASSIFICATION CUTOVER ===\n");
  testSameEmailWorkspaceIsolation();
  testBuyerPlusSellerWrites();
  testLegacyNullFallsBackToIntentNotUser();
  testImportWritesLeadOnly();
  testManualAddLeadWritesLeadOnly();
  console.log("\nLEAD CLASSIFICATION CUTOVER SELFTEST PASSED\n");
}

main();
