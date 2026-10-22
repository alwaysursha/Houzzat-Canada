/**
 * HIGH OCTANE staging snapshot safety. No database connection.
 * Run: pnpm exec tsx scripts/high-octane-staging-snapshot-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NEON_LISTING_MEDIA_CAP } from "../src/lib/listings/gallery-constants";
import { evaluateWebListingDetailInventoryAccess } from "../src/lib/tenancy/listing-entitlement/detail-entitlement";
import { RECOGNIZED_LISTING_DATA_PROVIDER_KEYS, normalizeRecognizedListingProviderKey } from "../src/lib/tenancy/listing-entitlement/provider-key";
import { buildPrismaEntitledInventoryWhere } from "../src/lib/tenancy/listing-entitlement/search-authority-filters";
import {
  HIGH_OCTANE_STAGING_SNAPSHOT_ALLOWLIST,
  HIGH_OCTANE_STAGING_SNAPSHOT_CONFIRMATION,
  HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
  HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
  applyHighOctaneStagingSnapshot,
  assessStagingSnapshotMediaUrl,
  isHighOctaneStagingSnapshotVisible,
  planHighOctaneStagingSnapshot,
  searchMayIncludeStagingSnapshot,
  selectHighOctaneStagingSnapshot,
  snapshotImportCliDecision,
  type StagingSnapshotCandidate,
  type StagingSnapshotWriteClient,
} from "../src/lib/tenancy/templates/high-octane-staging-snapshot";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";
import {
  HIGH_OCTANE_STAGING_SNAPSHOT_RETIRE_CONFIRMATION,
  applyHighOctaneStagingSnapshotRetirement,
  planHighOctaneStagingSnapshotRetirement,
  snapshotRetirementCliDecision,
  type StagingSnapshotRetirementClient,
} from "../src/lib/tenancy/templates/high-octane-staging-snapshot-retirement";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stagingPooled = "postgresql://staging:secret@ep-red-credit-axp65p8a-pooler.c-4.us-east-2.aws.neon.tech/neondb";
const productionPooled = "postgresql://prod:secret@ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech/neondb";

function readyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    STAGING_DATABASE_URL: stagingPooled,
    DATABASE_URL: productionPooled,
    HIGH_OCTANE_STAGING: "1",
    HIGH_OCTANE_STAGING_ACCESS: "authenticated",
    ...overrides,
  };
}

function photo(id: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    url: `https://images.ampre.ca/snapshot/${id}-${index + 1}.jpg`,
    sortOrder: index,
    isPrimary: index === 0,
  }));
}

function candidate(
  overrides: Partial<StagingSnapshotCandidate> & Pick<StagingSnapshotCandidate, "mlsNumber">,
): StagingSnapshotCandidate {
  const photos = overrides.photos ?? photo(overrides.mlsNumber, overrides.photoCount ?? 3);
  return {
    status: "ACTIVE",
    city: "Niagara Falls",
    propertyType: "DETACHED",
    listPrice: 900_000,
    beds: 4,
    baths: 3,
    sqft: 2800,
    addressLine: `${overrides.mlsNumber} Example Street`,
    brokerageName: "Example Brokerage",
    description: "Unmodified source description",
    lat: 43.09,
    lng: -79.08,
    waterfront: false,
    photoCount: photos.length,
    photos,
    providerListingKey: `key-${overrides.mlsNumber}`,
    listedAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
    photos: overrides.photos ?? photos,
  };
}

async function main() {
  const production = readyEnv({ NODE_ENV: "production" });
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
      env: production,
    }),
    false,
  );
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: "houzzat",
      env: readyEnv(),
    }),
    false,
  );
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: null,
      env: readyEnv(),
    }),
    false,
  );
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
      env: readyEnv({ HIGH_OCTANE_STAGING: undefined }),
    }),
    false,
  );
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
      env: readyEnv(),
    }),
    true,
  );
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: "another-tenant",
      env: readyEnv(),
    }),
    false,
  );
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: " ",
      env: readyEnv(),
    }),
    false,
  );
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
      env: readyEnv({
        STAGING_DATABASE_URL: productionPooled,
        DATABASE_URL: productionPooled,
      }),
    }),
    false,
  );
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
      env: readyEnv({ HIGH_OCTANE_STAGING_ACCESS: "public" }),
    }),
    false,
  );
  assert.equal(
    isHighOctaneStagingSnapshotVisible({
      workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
      env: readyEnv({
        PREVIEW_TEMPLATE: "royal-collection-one",
        STAGING_SNAPSHOT_VISIBLE: "1",
      }),
    }),
    true,
  );

  assert.equal(normalizeRecognizedListingProviderKey(HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY), null);
  assert.equal(
    (RECOGNIZED_LISTING_DATA_PROVIDER_KEYS as readonly string[]).includes(
      HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
    ),
    false,
  );

  const mixed = buildPrismaEntitledInventoryWhere({
    entitlement: { workspaceId: "houzzat", authorities: [] },
    statuses: ["ACTIVE"],
  });
  assert.equal(mixed.kind, "where");
  assert.equal(JSON.stringify(mixed).includes(HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE), false);
  const mlsOnly = buildPrismaEntitledInventoryWhere({
    entitlement: { workspaceId: "houzzat", authorities: [] },
    dataSource: "mls",
    statuses: ["ACTIVE"],
  });
  assert.equal(mlsOnly.kind, "empty");
  assert.equal(searchMayIncludeStagingSnapshot({ visible: false, status: "ACTIVE" }), false);
  assert.equal(searchMayIncludeStagingSnapshot({ visible: true, status: "SOLD" }), false);
  assert.equal(searchMayIncludeStagingSnapshot({ visible: true, status: "ACTIVE" }), true);

  assert.equal(
    evaluateWebListingDetailInventoryAccess({
      dataSource: "mls",
      status: "ACTIVE",
      organizationId: "org",
      providerKey: "proptx",
      entitlementFilteringEnabled: false,
    }).allowed,
    true,
  );
  assert.equal(
    evaluateWebListingDetailInventoryAccess({
      dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
      status: "ACTIVE",
      organizationId: null,
      providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
      entitlementFilteringEnabled: false,
      stagingSnapshotVisible: false,
    }).allowed,
    false,
  );
  assert.equal(
    evaluateWebListingDetailInventoryAccess({
      dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
      status: "ACTIVE",
      organizationId: null,
      providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
      stagingSnapshotVisible: true,
      additionalCapabilities: ["MEDIA"],
    }).allowed,
    true,
  );
  assert.equal(
    evaluateWebListingDetailInventoryAccess({
      dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
      status: "SOLD",
      organizationId: null,
      providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
      stagingSnapshotVisible: true,
    }).allowed,
    false,
  );
  assert.equal(
    evaluateWebListingDetailInventoryAccess({
      dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
      status: "ACTIVE",
      organizationId: null,
      providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
      stagingSnapshotVisible: true,
      additionalCapabilities: ["HISTORY"],
    }).allowed,
    false,
  );
  assert.equal(
    evaluateWebListingDetailInventoryAccess({
      dataSource: "mls",
      status: "ACTIVE",
      organizationId: "org",
      providerKey: "proptx",
      entitlement: { workspaceId: "houzzat", authorities: [] },
      entitlementFilteringEnabled: true,
      stagingSnapshotVisible: true,
    }).allowed,
    false,
  );
  assert.equal(
    evaluateWebListingDetailInventoryAccess({
      dataSource: "fsbo",
      status: "ACTIVE",
      organizationId: null,
      providerKey: null,
      entitlementFilteringEnabled: true,
      stagingSnapshotVisible: true,
    }).allowed,
    true,
  );

  assert.equal(assessStagingSnapshotMediaUrl("https://images.ampre.ca/a.jpg"), "public-cdn");
  assert.equal(assessStagingSnapshotMediaUrl("https://private.example.com/a.jpg"), "token-or-proxy");
  assert.equal(assessStagingSnapshotMediaUrl("not a url"), "rejected");
  assert.equal(NEON_LISTING_MEDIA_CAP, 5);

  const luxury = candidate({ mlsNumber: "SNAP-LUX", listPrice: 2_400_000, photoCount: 4 });
  const gta = candidate({
    mlsNumber: "SNAP-GTA",
    city: "Toronto",
    listPrice: 9_000_000,
    photoCount: 4,
  });
  const waterfront = candidate({
    mlsNumber: "SNAP-WATER",
    listPrice: 1_800_000,
    waterfront: true,
    photoCount: 3,
  });
  const condo = candidate({
    mlsNumber: "SNAP-CONDO",
    propertyType: "CONDO_APT",
    listPrice: 750_000,
    photoCount: 4,
  });
  const many = candidate({
    mlsNumber: "SNAP-MANY",
    propertyType: "TOWNHOUSE",
    listPrice: 640_000,
    photoCount: 12,
    photos: photo("SNAP-MANY", 12),
  });
  const limited = candidate({
    mlsNumber: "SNAP-FEW",
    listPrice: 500_000,
    photoCount: 1,
    photos: photo("SNAP-FEW", 1),
  });
  const sold = candidate({ mlsNumber: "SNAP-SOLD", status: "SOLD", listPrice: 8_000_000 });
  const before = JSON.stringify([luxury, waterfront, condo, many, limited, gta, sold]);
  const selected = selectHighOctaneStagingSnapshot([
    gta,
    sold,
    limited,
    many,
    condo,
    waterfront,
    luxury,
  ]);
  assert.equal(JSON.stringify([luxury, waterfront, condo, many, limited, gta, sold]), before);
  assert.deepEqual(
    selected.map((slot) => slot.candidate?.mlsNumber ?? null),
    ["SNAP-LUX", "SNAP-WATER", "SNAP-CONDO", "SNAP-MANY", "SNAP-FEW"],
  );
  assert.equal(selected[0]?.candidate?.city, "Niagara Falls");
  assert.equal(selected[0]?.candidate?.listPrice, 2_400_000);
  assert.equal(selected[0]?.candidate?.brokerageName, "Example Brokerage");

  const approvedLuxury = candidate({
    mlsNumber: "X12935628",
    listPrice: 2_400_000,
    photoCount: 4,
  });
  const approvedWater = candidate({
    mlsNumber: "X13744972",
    listPrice: 1_800_000,
    waterfront: true,
    photoCount: 3,
  });
  const approvedCondo = candidate({
    mlsNumber: "X13717936",
    propertyType: "CONDO_APT",
    listPrice: 750_000,
    photoCount: 4,
  });
  const approvedMany = candidate({
    mlsNumber: "N13526934",
    propertyType: "TOWNHOUSE",
    listPrice: 640_000,
    photoCount: 12,
    photos: photo("N13526934", 12),
  });
  const approvedLimited = candidate({
    mlsNumber: "X13542440",
    listPrice: 500_000,
    photoCount: 1,
    photos: photo("X13542440", 1),
  });
  assert.equal(new Set(HIGH_OCTANE_STAGING_SNAPSHOT_ALLOWLIST).size, 5);

  const planned = planHighOctaneStagingSnapshot({
    candidates: [
      approvedLuxury,
      approvedWater,
      approvedCondo,
      approvedMany,
      approvedLimited,
      candidate({ mlsNumber: "X00000001" }),
    ],
    existing: [{ mlsNumber: "X13744972", dataSource: "mls" }],
  });
  const water = planned.records.find((record) => record.slot === "waterfront-or-estate");
  assert.equal(water?.action, "rejected");
  assert.equal(water?.reason, "mls number already belongs to another inventory channel");
  const manyRecord = planned.records.find((record) => record.slot === "many-photographs");
  assert.equal(manyRecord?.copiedPhotoCount, 5);
  assert.equal(manyRecord?.omittedPhotoCount, 7);
  assert.equal(manyRecord?.listing?.listingKey, null);
  assert.equal(manyRecord?.listing?.organizationId, null);
  assert.equal(manyRecord?.listing?.dataSource, HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE);
  assert.equal(manyRecord?.source?.credentialRef, null);
  assert.equal(manyRecord?.source?.providerKey, HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY);
  assert.equal(manyRecord?.listing?.addressLine, approvedMany.addressLine);
  assert.equal(manyRecord?.listing?.listPrice, approvedMany.listPrice);
  assert.equal(manyRecord?.listing?.brokerageName, approvedMany.brokerageName);
  assert.equal(manyRecord?.listing?.mlsNumber, "N13526934");
  assert.equal(planned.manifest.mlsNumbers.includes("X13744972"), false);
  assert.equal(planned.manifest.mlsNumbers.includes("X00000001"), false);
  assert.equal(
    planned.records.find((record) => record.reason === "unapproved mls number")?.mlsNumber,
    "X00000001",
  );
  assert.equal(planned.manifest.mediaUrls.length > 0, true);
  assert.equal(
    planned.manifest.mlsNumbers.every((mls) =>
      (HIGH_OCTANE_STAGING_SNAPSHOT_ALLOWLIST as readonly string[]).includes(mls),
    ),
    true,
  );

  const duplicate = planHighOctaneStagingSnapshot({
    candidates: [approvedLuxury, { ...approvedLuxury, listPrice: 1 }],
    existing: [{ mlsNumber: "X12935628", dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE }],
  });
  assert.equal(
    duplicate.records.find((record) => record.action === "already_present")?.listing?.listPrice,
    approvedLuxury.listPrice,
  );
  assert.equal(
    duplicate.records.find((record) => record.reason === "duplicate candidate")?.mlsNumber,
    "X12935628",
  );

  const inactive = planHighOctaneStagingSnapshot({
    candidates: [candidate({ mlsNumber: "X12935628", status: "SOLD" })],
  });
  assert.equal(
    inactive.records.find((record) => record.mlsNumber === "X12935628")?.reason,
    "listing is not active",
  );
  assert.deepEqual(inactive.manifest.mlsNumbers, []);

  const unattributed = planHighOctaneStagingSnapshot({
    candidates: [candidate({ mlsNumber: "X12935628", brokerageName: " " })],
  });
  assert.equal(
    unattributed.records.find((record) => record.mlsNumber === "X12935628")?.reason,
    "missing listing brokerage attribution",
  );

  const noImage = planHighOctaneStagingSnapshot({
    candidates: [candidate({ mlsNumber: "N13526934", photos: [], photoCount: 0 })],
  });
  assert.equal(
    noImage.records.find((record) => record.mlsNumber === "N13526934")?.reason,
    "missing public image metadata",
  );

  let writes = 0;
  const writer = {
    async transaction<T>(fn: (tx: StagingSnapshotWriteClient) => Promise<T>) {
      writes += 1;
      return fn({
        query: async () => ({ rows: [{ branch_id: "br-dark-surf-axbepvr1" }] }),
        listing: { async create() { return { id: "listing-1" }; } },
        listingMedia: { async create() { return { id: "media-1" }; } },
        listingSource: { async create() { return { id: "source-1" }; } },
      });
    },
  };
  await assert.rejects(
    () =>
      applyHighOctaneStagingSnapshot({
        confirmation: HIGH_OCTANE_STAGING_SNAPSHOT_CONFIRMATION,
        env: production,
        records: planned.records,
        writer,
      }),
    /refused/,
  );
  assert.equal(writes, 0);
  await assert.rejects(
    () =>
      applyHighOctaneStagingSnapshot({
        confirmation: "APPLY",
        env: readyEnv(),
        records: planned.records.filter((record) => record.action === "create"),
        writer,
      }),
    /refused/,
  );
  assert.equal(writes, 0);

  let wrongBranchCreates = 0;
  await assert.rejects(
    () =>
      applyHighOctaneStagingSnapshot({
        confirmation: HIGH_OCTANE_STAGING_SNAPSHOT_CONFIRMATION,
        env: readyEnv(),
        records: planned.records.filter((record) => record.action === "create"),
        writer: {
          async transaction(fn) {
            return fn({
              query: async () => ({ rows: [{ branch_id: "br-falling-credit-axrjacil" }] }),
              listing: {
                async create() {
                  wrongBranchCreates += 1;
                  return { id: "should-not-exist" };
                },
              },
              listingMedia: { async create() { return { id: "media-1" }; } },
              listingSource: { async create() { return { id: "source-1" }; } },
            });
          },
        },
      }),
    /refused/,
  );
  assert.equal(wrongBranchCreates, 0);

  const created: Array<{ data: { organizationId: null; providerKey: string; listingKey: null } }> = [];
  const recording = {
    async transaction<T>(fn: (tx: StagingSnapshotWriteClient) => Promise<T>) {
      writes += 1;
      return fn({
        query: async () => ({ rows: [{ branch_id: "br-dark-surf-axbepvr1" }] }),
        listing: {
          async create(args) {
            created.push(args as (typeof created)[number]);
            return { id: "listing-1" };
          },
        },
        listingMedia: { async create() { return { id: "media-1" }; } },
        listingSource: { async create() { return { id: "source-1" }; } },
      });
    },
  };
  const applied = await applyHighOctaneStagingSnapshot({
    confirmation: HIGH_OCTANE_STAGING_SNAPSHOT_CONFIRMATION,
    env: readyEnv(),
    records: planned.records.filter((record) => record.action === "create"),
    writer: recording,
  });
  assert.equal(writes, 1);
  assert.equal(applied.applied, 4);
  assert.equal(created.every((row) => row.data.organizationId === null), true);
  assert.equal(created.every((row) => row.data.listingKey === null), true);
  assert.equal(
    created.every((row) => row.data.providerKey === HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY),
    true,
  );
  const unapprovedCreate = planned.records.find((record) => record.action === "create");
  assert.ok(unapprovedCreate?.listing);
  await assert.rejects(
    () =>
      applyHighOctaneStagingSnapshot({
        confirmation: HIGH_OCTANE_STAGING_SNAPSHOT_CONFIRMATION,
        env: readyEnv(),
        records: [
          {
            ...unapprovedCreate,
            mlsNumber: "X00000001",
            listing: { ...unapprovedCreate.listing, mlsNumber: "X00000001" },
          },
        ],
        writer: recording,
      }),
    /refused/,
  );
  assert.equal(writes, 1);

  assert.equal(snapshotImportCliDecision([]), "dry-run");
  assert.equal(snapshotImportCliDecision(["--dry-run"]), "dry-run");
  assert.equal(snapshotImportCliDecision(["--apply"]), "refused");
  assert.equal(snapshotImportCliDecision(["--dry-run", "--apply"]), "refused");

  const cli = readFileSync(join(root, "scripts/import-high-octane-staging-snapshot.ts"), "utf8");
  assert.equal(cli.includes("PrismaClient"), false);
  assert.equal(cli.includes("new Client"), false);
  assert.equal(cli.includes("applyHighOctaneStagingSnapshot"), false);
  assert.equal(cli.includes("DATABASE_URL"), false);
  assert.equal(cli.includes('source_read: "NO"'), true);
  assert.equal(cli.includes('destination_write: "NO"'), true);

  for (const relative of [
    "src/app/api/listings/search/route.ts",
    "src/app/api/listings/home-rails/route.ts",
    "src/app/(marketing)/listing/[...parts]/listing-operational.tsx",
    "src/lib/listings/listing-detail-api-access.ts",
  ]) {
    const source = readFileSync(join(root, relative), "utf8");
    assert.equal(source.includes("isHighOctaneStagingSnapshotVisible"), true, relative);
    assert.equal(source.includes('searchParams.get("stagingSnapshotVisible")'), false, relative);
    assert.equal(source.includes("stagingSnapshotVisible="), false, relative);
  }
  for (const relative of [
    "src/app/api/listings/[mlsNumber]/panel/route.ts",
    "src/app/api/listings/[mlsNumber]/insights/route.ts",
    "src/app/api/listings/[mlsNumber]/route.ts",
    "src/app/api/listings/nearby/route.ts",
    "src/app/api/listings/related/route.ts",
    "src/app/api/listings/by-mls/route.ts",
    "src/app/api/listings/autocomplete/route.ts",
    "src/components/areas/AreaSeoPage.tsx",
    "src/lib/home/load-home-customer-shell.ts",
    "src/app/api/saved-listings/route.ts",
    "src/app/(account)/account/saved/page.tsx",
    "src/app/(account)/account/notes/page.tsx",
    "src/app/api/account/notes/route.ts",
    "src/app/(account)/account/page.tsx",
    "src/app/api/account/recent-views/sync/route.ts",
  ]) {
    const source = readFileSync(join(root, relative), "utf8");
    assert.equal(
      source.includes("stagingSnapshotVisibleFromResolution") ||
        source.includes("stagingSnapshotVisibleForServerPage"),
      true,
      relative,
    );
    assert.equal(source.includes('searchParams.get("stagingSnapshotVisible")'), false, relative);
  }
  for (const relative of [
    "src/app/sitemap.ts",
    "src/lib/market/pulse.ts",
    "src/lib/geo/area-seo.ts",
    "src/lib/geo/home-area-stats.ts",
    "src/lib/listings/address-history.ts",
    "src/lib/property-address/neighbourhood-insights.ts",
    "src/lib/listings/precise-property-search.ts",
    "src/lib/email/digests/search.ts",
    "src/lib/account/monitors.ts",
    "src/lib/route-planner/server.ts",
    "src/app/api/route-planner/route.ts",
    "src/lib/market/cma.ts",
    "src/app/(agent)/agent/cma/page.tsx",
    "src/app/(admin)/admin/ads/new/page.tsx",
    "src/app/(marketing)/share/homes/[token]/page.tsx",
    "src/lib/mobile/v2/load-saved-listing-cards.ts",
    "src/lib/agent/send-shortlist-email.ts",
    "src/app/api/account/property-monitors/route.ts",
    "src/lib/agent/customer-timeline.ts",
    "src/lib/agent/leads-dashboard.ts",
    "src/lib/agent/buyer-intent.ts",
    "src/lib/email/resend-webhook.ts",
  ]) {
    const source = readFileSync(join(root, relative), "utf8");
    assert.equal(source.includes("excludeStagingSnapshotWhere"), true, relative);
    assert.equal(source.includes("stagingSnapshotVisibleFromResolution"), false, relative);
  }

  const approvedOnRealMls = planHighOctaneStagingSnapshotRetirement({
    manifestMlsNumbers: ["X12935628"],
    existing: [{ mlsNumber: "X12935628", dataSource: "mls", providerKey: "proptx" }],
  });
  assert.deepEqual(approvedOnRealMls.retire, []);
  assert.equal(approvedOnRealMls.keptDifferentSource[0]?.providerKey, "proptx");

  const retirement = planHighOctaneStagingSnapshotRetirement({
    manifestMlsNumbers: ["SNAP-MANY", "SNAP-REAL", "SNAP-MISSING"],
    existing: [
      {
        mlsNumber: "SNAP-MANY",
        dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
        providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
      },
      { mlsNumber: "SNAP-REAL", dataSource: "mls", providerKey: "proptx" },
    ],
  });
  assert.deepEqual(retirement.retire, ["SNAP-MANY"]);
  assert.equal(retirement.keptDifferentSource[0]?.mlsNumber, "SNAP-REAL");
  assert.deepEqual(retirement.missing, ["SNAP-MISSING"]);

  const retiredIds: string[] = [];
  await assert.rejects(
    () =>
      applyHighOctaneStagingSnapshotRetirement({
        confirmation: HIGH_OCTANE_STAGING_SNAPSHOT_RETIRE_CONFIRMATION,
        env: production,
        manifestMlsNumbers: ["SNAP-MANY"],
        writer: {
          async transaction() {
            throw new Error("transaction opened");
          },
        },
      }),
    /refused/,
  );
  await assert.rejects(
    () =>
      applyHighOctaneStagingSnapshotRetirement({
        confirmation: HIGH_OCTANE_STAGING_SNAPSHOT_RETIRE_CONFIRMATION,
        env: readyEnv(),
        manifestMlsNumbers: ["SNAP-MANY", "SNAP-REAL"],
        writer: {
          async transaction(fn) {
            return fn({
              query: async () => ({ rows: [{ branch_id: "br-falling-credit-axrjacil" }] }),
              listing: {
                async findMany() {
                  return [{ id: "listing-real", mlsNumber: "SNAP-REAL" }];
                },
                async deleteMany() {
                  retiredIds.push("listing");
                  return { count: 1 };
                },
              },
              listingMedia: { async deleteMany() { return { count: 0 }; } },
              listingRoom: { async deleteMany() { return { count: 0 }; } },
              listingSource: { async deleteMany() { return { count: 0 }; } },
              listingHistory: { async deleteMany() { return { count: 0 }; } },
              openHouse: { async deleteMany() { return { count: 0 }; } },
            } satisfies StagingSnapshotRetirementClient);
          },
        },
      }),
    /refused/,
  );
  assert.deepEqual(retiredIds, []);

  const retired = await applyHighOctaneStagingSnapshotRetirement({
    confirmation: HIGH_OCTANE_STAGING_SNAPSHOT_RETIRE_CONFIRMATION,
    env: readyEnv(),
    manifestMlsNumbers: ["SNAP-MANY", "SNAP-REAL"],
    writer: {
      async transaction(fn) {
        return fn({
          query: async () => ({ rows: [{ branch_id: "br-dark-surf-axbepvr1" }] }),
          listing: {
            async findMany(args) {
              assert.equal(
                JSON.stringify(args.where).includes(HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE),
                true,
              );
              assert.equal(JSON.stringify(args.where).includes("proptx"), false);
              return [{ id: "listing-snap", mlsNumber: "SNAP-MANY" }];
            },
            async deleteMany(args) {
              retiredIds.push(JSON.stringify(args.where));
              return { count: 1 };
            },
          },
          listingMedia: { async deleteMany() { return { count: 1 }; } },
          listingRoom: { async deleteMany() { return { count: 0 }; } },
          listingSource: { async deleteMany() { return { count: 1 }; } },
          listingHistory: { async deleteMany() { return { count: 0 }; } },
          openHouse: { async deleteMany() { return { count: 0 }; } },
        });
      },
    },
  });
  assert.deepEqual(retired.retired, ["SNAP-MANY"]);
  assert.equal(retiredIds.some((where) => where.includes("listing-snap")), true);
  assert.equal(retiredIds.some((where) => where.includes("mls")), false);

  assert.equal(snapshotRetirementCliDecision(["--dry-run"]), "dry-run");
  assert.equal(snapshotRetirementCliDecision(["--apply"]), "refused");
  const retireCli = readFileSync(
    join(root, "scripts/retire-high-octane-staging-snapshot.ts"),
    "utf8",
  );
  assert.equal(retireCli.includes("PrismaClient"), false);
  assert.equal(retireCli.includes("applyHighOctaneStagingSnapshotRetirement"), false);
  assert.equal(retireCli.includes('destination_write: "NO"'), true);

  console.log("high-octane-staging-snapshot-selftest: ok");
}

void main();
