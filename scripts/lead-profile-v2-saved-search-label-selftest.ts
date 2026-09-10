/**
 * Lead Profile V2 Info savedSearchLabel selftest.
 * Run: node --import tsx scripts/lead-profile-v2-saved-search-label-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectV2PrimarySavedSearchRow,
  v2SavedSearchLabel,
} from "../src/lib/agent/lead-profile-v2/looking-for-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/lib/agent/lead-summary.ts",
  "src/lib/agent/lead-profile-snapshot.ts",
];

function testLegacyUntouchedByV2Imports() {
  for (const rel of LEGACY_FILES) {
    const src = read(rel);
    assert.equal(
      src.includes("lead-profile-v2"),
      false,
      `${rel} must not import V2`,
    );
    assert.equal(
      src.includes("leads-v2"),
      false,
      `${rel} must not reference V2 routes`,
    );
  }
}

function testExactFormattedValue() {
  assert.equal(
    v2SavedSearchLabel({ name: "Oakville homes", query: {} }),
    "Oakville homes",
  );
  assert.equal(
    v2SavedSearchLabel({ name: "", query: {} }),
    "Saved search",
  );
  assert.equal(
    v2SavedSearchLabel({
      name: "Ignored name",
      query: { city: "Mississauga", bedsMin: 3, priceMax: 900000 },
    }),
    `Mississauga, 3+ beds, to $${Number(900000).toLocaleString()}`,
  );
  assert.equal(
    v2SavedSearchLabel({
      name: "Keep name",
      query: { cities: ["Toronto"], minBeds: 2, maxPrice: 800000 },
    }),
    "Keep name",
  );
  const summary = read("src/lib/agent/lead-summary.ts");
  assert.ok(summary.includes("typeof q?.city === \"string\" ? q.city : null"));
  assert.ok(summary.includes("typeof q?.bedsMin === \"number\""));
  assert.ok(summary.includes("typeof q?.priceMax === \"number\""));
}

function testNoSearchFallback() {
  assert.equal(selectV2PrimarySavedSearchRow([]), null);
  const loader = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
  assert.ok(loader.includes("primarySearch ? v2SavedSearchLabel(primarySearch) : null"));
  const info = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2InfoPanel.tsx",
  );
  assert.ok(info.includes('label="Search"'));
  assert.ok(info.includes("value={savedSearchLabel}"));
  const row = read(
    "src/components/agent/lead-profile-v2/contact-fields.tsx",
  );
  assert.ok(row.includes('{value || "—"}'));
}

function testConflictingSavedSearches() {
  const olderPrimary = {
    isPrimary: true,
    updatedAt: "2020-01-01T00:00:00.000Z",
    name: "Primary",
    query: { city: "Oakville" },
  };
  const newerOther = {
    isPrimary: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
    name: "Newer",
    query: { city: "Toronto" },
  };
  const chosen = selectV2PrimarySavedSearchRow([newerOther, olderPrimary]);
  assert.equal(chosen?.name, "Primary");
  assert.equal(v2SavedSearchLabel(chosen!), "Oakville");

  const laterPrimary = {
    isPrimary: true,
    updatedAt: "2026-06-01T00:00:00.000Z",
    name: "Later primary",
    query: {},
  };
  const earlierPrimary = {
    isPrimary: true,
    updatedAt: "2025-01-01T00:00:00.000Z",
    name: "Earlier primary",
    query: {},
  };
  assert.equal(
    selectV2PrimarySavedSearchRow([earlierPrimary, laterPrimary])?.name,
    "Later primary",
  );

  const loader = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
  assert.ok(loader.includes("{ isPrimary: \"desc\" }"));
  assert.ok(loader.includes("{ updatedAt: \"desc\" }"));
  assert.equal(loader.includes("isHomepageActive"), false);
  const summary = read("src/lib/agent/lead-summary.ts");
  assert.ok(
    summary.includes("orderBy: [{ isPrimary: \"desc\" }, { updatedAt: \"desc\" }]"),
  );
}

function testNoDuplicateQuery() {
  const loader = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
  assert.equal(loader.split("prisma.savedSearch.findFirst").length - 1, 1);
  assert.equal(loader.includes("findMany"), false);
  assert.equal(loader.includes("loadBuyerIntent("), false);
  const shell = read("src/lib/agent/lead-profile-v2/load-shell.ts");
  assert.equal(shell.includes("prisma.savedSearch"), false);
}

function testInfoDoesNotWaitForEngagement() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const infoCase =
    host.split('case "info":')[1]?.split('case "activity":')[0] ?? "";
  assert.ok(infoCase.includes("savedSearchLabel={"));
  assert.ok(infoCase.includes("lookingForResource.panel?.savedSearchLabel"));
  assert.equal(infoCase.includes("engagement.panel"), false);
  assert.ok(
    host.includes("useLeadProfileV2LookingFor("),
  );
  assert.ok(host.includes("data != null && data.lead.id === leadId"));
}

function testPresentationParity() {
  const info = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2InfoPanel.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  const hotIdx = info.indexOf('label="Hotness"');
  const searchIdx = info.indexOf('label="Search"');
  const campaignIdx = info.indexOf('label="Campaign"');
  assert.ok(hotIdx > 0 && searchIdx > hotIdx && campaignIdx > searchIdx);
  assert.ok(legacy.includes('label="Search"'));
  assert.ok(legacy.includes("value={data.savedSearchLabel}"));
}

function testTargetedRefresh() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const helper = read(
    "src/lib/agent/lead-profile-v2/saved-search-rail-refresh-query.ts",
  );
  const savedSearch =
    host.split("const onSavedSearchUpdated")[1]?.split(
      "function startEditContact",
    )[0] ?? "";
  assert.ok(savedSearch.includes("applyV2SavedSearchEditorUpdatedRefresh"));
  assert.ok(savedSearch.includes("reloadLookingFor"));
  assert.equal(savedSearch.includes("reload()"), false);
  const editorFn =
    helper.split("export function applyV2SavedSearchEditorUpdatedRefresh")[1] ??
    "";
  assert.ok(editorFn.includes("reloadLookingFor()"));
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testExactFormattedValue();
  testNoSearchFallback();
  testConflictingSavedSearches();
  testNoDuplicateQuery();
  testInfoDoesNotWaitForEngagement();
  testPresentationParity();
  testTargetedRefresh();
  console.log("lead-profile-v2-saved-search-label-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
