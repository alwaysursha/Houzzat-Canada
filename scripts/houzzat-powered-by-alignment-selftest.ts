/**
 * Stage 3K.4.4 / 3K.4.4.1 — Houzzat powered-by drift detection + guarded alignment selftest.
 * Run: pnpm houzzat-powered-by-alignment:selftest
 */
import assert from "node:assert/strict";
import { HOUZZAT_BRANDING_SEED } from "./lib/houzzat-branding-seed";
import {
  brandingMatchesHouzzatSeed,
  brandingMatchesHouzzatSeedExceptPoweredBy,
  diffHouzzatBrandingFields,
  getHouzzatBrandingDriftFieldNames,
  isHouzzatBrandingComparableRow,
  isHouzzatPoweredByOnlyDrift,
} from "./lib/houzzat-branding-diff";
import { resolveRuntimePoweredByFromRow } from "./lib/houzzat-powered-by-alignment";
import type { WorkspaceBranding } from "@prisma/client";

function houzzatRow(
  overrides: Partial<WorkspaceBranding> = {},
): WorkspaceBranding {
  return {
    id: "branding_houzzat",
    workspaceId: "ws_houzzat",
    tier: HOUZZAT_BRANDING_SEED.tier,
    displayName: HOUZZAT_BRANDING_SEED.displayName,
    tagline: HOUZZAT_BRANDING_SEED.tagline,
    logoUrl: HOUZZAT_BRANDING_SEED.logoUrl,
    brokerageLogoUrl: HOUZZAT_BRANDING_SEED.brokerageLogoUrl,
    faviconUrl: HOUZZAT_BRANDING_SEED.faviconUrl,
    ogImageUrl: HOUZZAT_BRANDING_SEED.ogImageUrl,
    primaryColor: HOUZZAT_BRANDING_SEED.primaryColor,
    secondaryColor: HOUZZAT_BRANDING_SEED.secondaryColor,
    accentColor: HOUZZAT_BRANDING_SEED.accentColor,
    contactEmail: HOUZZAT_BRANDING_SEED.contactEmail,
    contactPhone: HOUZZAT_BRANDING_SEED.contactPhone,
    footerLegalText: HOUZZAT_BRANDING_SEED.footerLegalText,
    poweredByHouzzatPro: HOUZZAT_BRANDING_SEED.poweredByHouzzatPro,
    seoDescription: HOUZZAT_BRANDING_SEED.seoDescription,
    version: HOUZZAT_BRANDING_SEED.version,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function comparableFromRow(row: WorkspaceBranding) {
  return {
    tier: row.tier,
    displayName: row.displayName,
    tagline: row.tagline,
    logoUrl: row.logoUrl,
    brokerageLogoUrl: row.brokerageLogoUrl,
    faviconUrl: row.faviconUrl,
    ogImageUrl: row.ogImageUrl,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    accentColor: row.accentColor,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    footerLegalText: row.footerLegalText,
    poweredByHouzzatPro: row.poweredByHouzzatPro,
    seoDescription: row.seoDescription,
    version: row.version,
  };
}

function testSeedRowMatches() {
  const row = houzzatRow();
  assert.equal(brandingMatchesHouzzatSeed(comparableFromRow(row)), true);
  assert.equal(isHouzzatPoweredByOnlyDrift(comparableFromRow(row)), false);
  assert.deepEqual(getHouzzatBrandingDriftFieldNames(comparableFromRow(row)), []);
}

function testProductionLikePoweredByOnlyDrift() {
  const row = comparableFromRow(houzzatRow({ poweredByHouzzatPro: false }));
  assert.equal(brandingMatchesHouzzatSeed(row), false);
  assert.equal(brandingMatchesHouzzatSeedExceptPoweredBy(row), true);
  assert.equal(isHouzzatPoweredByOnlyDrift(row), true);
  assert.deepEqual(getHouzzatBrandingDriftFieldNames(row), ["poweredByHouzzatPro"]);
}

function testPartialRowGuardRegression() {
  const partialApplyRow = { poweredByHouzzatPro: false };
  assert.equal(isHouzzatBrandingComparableRow(partialApplyRow), false);
  assert.equal(isHouzzatPoweredByOnlyDrift(partialApplyRow), false);
  const hiddenDrift = getHouzzatBrandingDriftFieldNames(partialApplyRow);
  assert.ok(hiddenDrift.includes("tier"));
  assert.ok(hiddenDrift.includes("displayName"));
  assert.ok(hiddenDrift.length > 1);
}

function testOtherFieldDriftBlocks() {
  const row = comparableFromRow(
    houzzatRow({
      poweredByHouzzatPro: false,
      displayName: "Not Houzzat",
    }),
  );
  assert.equal(isHouzzatPoweredByOnlyDrift(row), false);
  assert.equal(brandingMatchesHouzzatSeedExceptPoweredBy(row), false);
  const drift = getHouzzatBrandingDriftFieldNames(row);
  assert.ok(drift.includes("poweredByHouzzatPro"));
  assert.ok(drift.includes("displayName"));
}

function testNullUndefinedOptionalEquivalence() {
  const withNull = comparableFromRow(houzzatRow({ contactEmail: null }));
  assert.equal(
    brandingMatchesHouzzatSeedExceptPoweredBy(withNull),
    false,
    "null contactEmail is real drift vs seed value",
  );

  const seedContact = HOUZZAT_BRANDING_SEED.contactEmail;
  const withUndefined = {
    ...comparableFromRow(houzzatRow()),
    contactEmail: undefined,
  };
  assert.equal(isHouzzatBrandingComparableRow(withUndefined), false);

  const bothNullComparable = {
    ...comparableFromRow(houzzatRow()),
    contactEmail: null,
    contactPhone: undefined as unknown as null,
  };
  bothNullComparable.contactPhone = null;
  assert.equal(
    diffHouzzatBrandingFields(bothNullComparable).find((e) => e.field === "contactPhone")
      ?.match,
    false,
  );
  assert.notEqual(seedContact, null);
}

function testWhitespaceFooterDrift() {
  const row = comparableFromRow(
    houzzatRow({
      poweredByHouzzatPro: false,
      footerLegalText: `${HOUZZAT_BRANDING_SEED.footerLegalText}\n`,
    }),
  );
  assert.equal(isHouzzatPoweredByOnlyDrift(row), false);
  assert.ok(getHouzzatBrandingDriftFieldNames(row).includes("footerLegalText"));
}

function testAlreadyTrueMatches() {
  const row = comparableFromRow(houzzatRow({ poweredByHouzzatPro: true }));
  assert.equal(brandingMatchesHouzzatSeed(row), true);
  assert.equal(isHouzzatPoweredByOnlyDrift(row), false);
  assert.deepEqual(getHouzzatBrandingDriftFieldNames(row), []);
}

function testResolverForcesTrueDespiteDbFalse() {
  const row = houzzatRow({ poweredByHouzzatPro: false });
  assert.equal(resolveRuntimePoweredByFromRow("ws_houzzat", row), true);
}

testSeedRowMatches();
testProductionLikePoweredByOnlyDrift();
testPartialRowGuardRegression();
testOtherFieldDriftBlocks();
testNullUndefinedOptionalEquivalence();
testWhitespaceFooterDrift();
testAlreadyTrueMatches();
testResolverForcesTrueDespiteDbFalse();

console.log("houzzat-powered-by-alignment:selftest OK");
