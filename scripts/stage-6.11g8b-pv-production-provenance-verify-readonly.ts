/**
 * Stage 6.11G.8B-PV — read-only production provenance verification.
 * No writes / backfill / deploy.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const WS = "cmt7kfcth0000gvu0bqsycsvz";

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const total = await prisma.listing.count();
  const orgSet = await prisma.listing.count({
    where: { organizationId: { not: null } },
  });
  const providerProptx = await prisma.listing.count({
    where: { providerKey: "proptx" },
  });
  const sourceTotal = await prisma.listingSource.count();
  const sourcePrimary = await prisma.listingSource.count({
    where: { isPrimary: true },
  });
  const sourceCanonical = await prisma.listingSource.count({
    where: {
      organizationId: TRREB,
      providerKey: "proptx",
      isPrimary: true,
    },
  });

  const nonMlsOrg = await prisma.listing.count({
    where: { dataSource: { not: "mls" }, organizationId: { not: null } },
  });
  const nonMlsProvider = await prisma.listing.count({
    where: { dataSource: { not: "mls" }, providerKey: { not: null } },
  });
  const nonMlsSourceRows = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "ListingSource" ls
    JOIN "Listing" l ON l.id = ls."listingId"
    WHERE l."dataSource" <> 'mls'
  `;

  const mem = await prisma.workspaceRealEstateOrganizationMembership.findUnique({
    where: {
      workspaceId_organizationId: {
        workspaceId: WS,
        organizationId: TRREB,
      },
    },
    select: { id: true, status: true, membershipIdentifier: true },
  });
  const conn = await prisma.workspaceDataConnection.findUnique({
    where: {
      workspaceId_organizationId_providerKey: {
        workspaceId: WS,
        organizationId: TRREB,
        providerKey: "proptx",
      },
    },
    select: {
      id: true,
      status: true,
      credentialRef: true,
      providerKey: true,
    },
  });
  const caps = await prisma.workspaceDataConnectionCapability.findMany({
    where: {
      connection: {
        workspaceId: WS,
        organizationId: TRREB,
        providerKey: "proptx",
      },
    },
    select: { capability: true },
    orderBy: { capability: "asc" },
  });

  const recentProvenance = await prisma.$queryRaw<
    Array<{
      listings_with_provenance: bigint;
      earliest_source: Date | null;
      latest_source: Date | null;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS listings_with_provenance,
      MIN(ls."createdAt") AS earliest_source,
      MAX(ls."createdAt") AS latest_source
    FROM "ListingSource" ls
    WHERE ls."organizationId" = ${TRREB}
      AND ls."providerKey" = 'proptx'
  `;

  const samples = await prisma.$queryRaw<
    Array<{
      id: string;
      mlsNumber: string;
      dataSource: string;
      isMock: boolean;
      key_ok: boolean;
      key_eq_listing: boolean;
      organizationId: string | null;
      providerKey: string | null;
      listing_updated: Date;
      source_id: string;
      src_org: string | null;
      src_provider: string;
      src_key_matches: boolean;
      src_mls_matches: boolean;
      isPrimary: boolean;
      source_created: Date;
      source_count: bigint;
    }>
  >`
    SELECT
      l.id,
      l."mlsNumber",
      l."dataSource",
      l."isMock",
      (l."listingKey" IS NOT NULL AND btrim(l."listingKey") <> '') AS key_ok,
      (ls."providerListingKey" = l."listingKey") AS key_eq_listing,
      l."organizationId",
      l."providerKey",
      l."updatedAt" AS listing_updated,
      ls.id AS source_id,
      ls."organizationId" AS src_org,
      ls."providerKey" AS src_provider,
      (ls."providerListingKey" = l."listingKey") AS src_key_matches,
      (ls."sourceMlsNumber" = l."mlsNumber") AS src_mls_matches,
      ls."isPrimary",
      ls."createdAt" AS source_created,
      (
        SELECT COUNT(*)::bigint
        FROM "ListingSource" s2
        WHERE s2."listingId" = l.id
      ) AS source_count
    FROM "Listing" l
    JOIN "ListingSource" ls ON ls."listingId" = l.id AND ls."isPrimary" = true
    WHERE l."organizationId" = ${TRREB}
      AND l."providerKey" = 'proptx'
    ORDER BY ls."createdAt" DESC
    LIMIT 10
  `;

  const sourceDupes = await prisma.$queryRaw<
    Array<{ listingId: string; c: bigint }>
  >`
    SELECT ls."listingId", COUNT(*)::bigint AS c
    FROM "ListingSource" ls
    GROUP BY ls."listingId"
    HAVING COUNT(*) > 1
    LIMIT 5
  `;

  const mirrorSourceMismatch = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "Listing" l
    LEFT JOIN "ListingSource" ls
      ON ls."listingId" = l.id
     AND ls."isPrimary" = true
     AND ls."providerKey" = 'proptx'
    WHERE l."providerKey" = 'proptx'
      AND (
        ls.id IS NULL
        OR l."organizationId" IS DISTINCT FROM ls."organizationId"
        OR l."providerKey" IS DISTINCT FROM ls."providerKey"
        OR ls."providerListingKey" IS DISTINCT FROM l."listingKey"
      )
  `;

  const n = (v: bigint | number | null | undefined) =>
    v == null ? 0 : Number(v);

  console.log(
    JSON.stringify(
      {
        total,
        orgSet,
        providerProptx,
        sourceTotal,
        sourcePrimary,
        sourceCanonical,
        nonMlsOrg,
        nonMlsProvider,
        nonMlsSource: n(nonMlsSourceRows[0]?.c),
        membership: mem,
        connection: conn,
        capabilities: caps.map((c) => c.capability),
        capabilityCount: caps.length,
        recentProvenance: {
          listings_with_provenance: n(
            recentProvenance[0]?.listings_with_provenance,
          ),
          earliest_source: recentProvenance[0]?.earliest_source,
          latest_source: recentProvenance[0]?.latest_source,
        },
        sourceDupes: sourceDupes.map((d) => ({
          listingId_prefix: d.listingId.slice(0, 10),
          count: n(d.c),
        })),
        mirrorSourceMismatch: n(mirrorSourceMismatch[0]?.c),
        samples: samples.map((s) => ({
          listingId_prefix: s.id.slice(0, 12),
          mlsNumber: s.mlsNumber,
          dataSource: s.dataSource,
          isMock: s.isMock,
          key_ok: s.key_ok,
          organizationId_ok: s.organizationId === TRREB,
          providerKey: s.providerKey,
          source_count: n(s.source_count),
          src_org_ok: s.src_org === TRREB,
          src_provider: s.src_provider,
          src_key_matches: s.src_key_matches,
          src_mls_matches: s.src_mls_matches,
          isPrimary: s.isPrimary,
          source_created: s.source_created,
          listing_updated: s.listing_updated,
        })),
      },
      null,
      2,
    ),
  );

  const retouched = await prisma.$queryRaw<
    Array<{
      id_prefix: string;
      mlsNumber: string;
      source_created: Date;
      listing_updated: Date;
      source_count: bigint;
      seconds_after_source: number;
    }>
  >`
    SELECT
      left(l.id, 12) AS id_prefix,
      l."mlsNumber",
      ls."createdAt" AS source_created,
      l."updatedAt" AS listing_updated,
      (SELECT COUNT(*)::bigint FROM "ListingSource" s WHERE s."listingId" = l.id) AS source_count,
      EXTRACT(EPOCH FROM (l."updatedAt" - ls."createdAt"))::float8 AS seconds_after_source
    FROM "Listing" l
    JOIN "ListingSource" ls ON ls."listingId" = l.id AND ls."isPrimary" = true
    WHERE l."organizationId" = ${TRREB}
      AND l."providerKey" = 'proptx'
      AND l."updatedAt" > ls."createdAt" + interval '2 seconds'
    ORDER BY (l."updatedAt" - ls."createdAt") DESC
    LIMIT 8
  `;

  const recentRuns = await prisma.mlsSyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      id: true,
      resource: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      message: true,
      stats: true,
    },
  });

  const syncSummary = recentRuns.map((r) => {
    const stats =
      r.stats && typeof r.stats === "object"
        ? (r.stats as Record<string, unknown>)
        : {};
    const errors = Array.isArray(stats.errors) ? stats.errors : [];
    const skip =
      stats.skipReasons && typeof stats.skipReasons === "object"
        ? (stats.skipReasons as Record<string, number>)
        : {};
    const provenanceSkips = Object.entries(skip).filter(([k]) =>
      k.includes("provenance"),
    );
    const provenanceErrMsgs = errors
      .map((e) => String(e))
      .filter((e) =>
        /provenance|PropTxProvenance|mirror_organization|mirror_provider|listing_key_identity|directory_/i.test(
          e,
        ),
      );
    return {
      id_prefix: r.id.slice(0, 10),
      resource: r.resource,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      message:
        typeof r.message === "string" ? r.message.slice(0, 200) : r.message,
      propertyUpserted: stats.propertyUpserted ?? null,
      propertySkipped: stats.propertySkipped ?? null,
      provenanceSkips,
      provenanceErrMsgs: provenanceErrMsgs.slice(0, 5),
      errorsSample: errors.slice(0, 3).map((e) => String(e).slice(0, 160)),
    };
  });

  console.log(
    "\n--- IDEMPOTENCY / SYNC ---\n" +
      JSON.stringify(
        {
          retouched: retouched.map((r) => ({
            ...r,
            source_count: n(r.source_count),
          })),
          syncSummary,
        },
        null,
        2,
      ),
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
