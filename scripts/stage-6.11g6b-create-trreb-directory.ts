/**
 * Stage 6.11G.6B — create the canonical TRREB RealEstateOrganization directory row.
 *
 *   pnpm exec tsx scripts/stage-6.11g6b-create-trreb-directory.ts
 *   pnpm exec tsx scripts/stage-6.11g6b-create-trreb-directory.ts --confirm-production-write
 *
 * Idempotent:
 * - absent → create
 * - present + exact match → no-op
 * - present + field conflict → STOP (no update)
 *
 * Directory only. Grants ZERO listing rights / membership / DataConnection.
 * No $transaction / updateMany. No listing provenance mutation.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const CANONICAL = {
  name: "Toronto Regional Real Estate Board",
  slug: "ca-on-trreb",
  shortName: "TRREB",
  countryCode: "CA",
  regionCode: "ON",
  kind: "BOARD" as const,
  supportStatus: "SUPPORTED" as const,
  officialUrl: "https://trreb.ca",
  active: true,
};

type ReoRow = {
  id: string;
  name: string;
  slug: string;
  shortName: string | null;
  countryCode: string;
  regionCode: string | null;
  kind: string;
  supportStatus: string;
  officialUrl: string | null;
  active: boolean;
};

function conflicts(existing: ReoRow): string[] {
  const diffs: string[] = [];
  const checks: Array<[keyof typeof CANONICAL, unknown]> = [
    ["name", existing.name],
    ["slug", existing.slug],
    ["shortName", existing.shortName],
    ["countryCode", existing.countryCode],
    ["regionCode", existing.regionCode],
    ["kind", existing.kind],
    ["supportStatus", existing.supportStatus],
    ["officialUrl", existing.officialUrl],
    ["active", existing.active],
  ];
  for (const [key, actual] of checks) {
    if (actual !== CANONICAL[key]) {
      diffs.push(`${key}: expected ${JSON.stringify(CANONICAL[key])}, got ${JSON.stringify(actual)}`);
    }
  }
  return diffs;
}

async function main() {
  const confirm = process.argv.includes("--confirm-production-write");
  const { prisma } = await import("../src/lib/prisma");

  console.log("=== STAGE 6.11G.6B — CANONICAL TRREB DIRECTORY ===\n");

  const [
    reoCount,
    memCount,
    connCount,
    listingsWithOrg,
    listingsWithProvider,
    sourceCount,
  ] = await Promise.all([
    prisma.realEstateOrganization.count(),
    prisma.workspaceRealEstateOrganizationMembership.count(),
    prisma.workspaceDataConnection.count(),
    prisma.listing.count({ where: { organizationId: { not: null } } }),
    prisma.listing.count({ where: { providerKey: { not: null } } }),
    prisma.listingSource.count(),
  ]);

  console.log("Pre-check counts:");
  console.log(`  RealEstateOrganization: ${reoCount}`);
  console.log(`  Memberships: ${memCount}`);
  console.log(`  DataConnections: ${connCount}`);
  console.log(`  Listing.organizationId set: ${listingsWithOrg}`);
  console.log(`  Listing.providerKey set: ${listingsWithProvider}`);
  console.log(`  ListingSource: ${sourceCount}`);

  if (memCount !== 0 || connCount !== 0 || listingsWithOrg !== 0 || listingsWithProvider !== 0 || sourceCount !== 0) {
    console.error("STOP: unexpected non-empty membership/connection/provenance state");
    process.exit(2);
  }

  const existing = await prisma.realEstateOrganization.findUnique({
    where: { slug: CANONICAL.slug },
  });

  if (existing) {
    const diffs = conflicts(existing);
    if (diffs.length > 0) {
      console.error("STOP: ca-on-trreb exists but canonical fields conflict:");
      for (const d of diffs) console.error(`  - ${d}`);
      process.exit(2);
    }
    console.log("\nAlready complete — exact canonical match. No write.");
    console.log(JSON.stringify(existing, null, 2));
    return;
  }

  if (reoCount !== 0) {
    console.error(
      `STOP: directory is not empty (count=${reoCount}) but ca-on-trreb is absent — investigate before creating`,
    );
    process.exit(2);
  }

  if (!confirm) {
    console.log("\nDry-run OK. Re-run with --confirm-production-write to create.");
    console.log("Would create:", CANONICAL);
    return;
  }

  const created = await prisma.realEstateOrganization.create({
    data: {
      name: CANONICAL.name,
      slug: CANONICAL.slug,
      shortName: CANONICAL.shortName,
      countryCode: CANONICAL.countryCode,
      regionCode: CANONICAL.regionCode,
      kind: CANONICAL.kind,
      supportStatus: CANONICAL.supportStatus,
      officialUrl: CANONICAL.officialUrl,
      active: CANONICAL.active,
    },
  });

  console.log("\nCreated TRREB directory row:");
  console.log(JSON.stringify(created, null, 2));

  const after = await Promise.all([
    prisma.realEstateOrganization.count(),
    prisma.workspaceRealEstateOrganizationMembership.count(),
    prisma.workspaceDataConnection.count(),
    prisma.workspaceDataConnectionCapability.count(),
    prisma.listing.count({ where: { organizationId: { not: null } } }),
    prisma.listing.count({ where: { providerKey: { not: null } } }),
    prisma.listingSource.count(),
    prisma.realEstateOrganization.findUnique({ where: { slug: CANONICAL.slug } }),
  ]);

  console.log("\nPost-create:");
  console.log(`  RealEstateOrganization: ${after[0]}`);
  console.log(`  Memberships: ${after[1]}`);
  console.log(`  DataConnections: ${after[2]}`);
  console.log(`  Capabilities: ${after[3]}`);
  console.log(`  Listing.organizationId set: ${after[4]}`);
  console.log(`  Listing.providerKey set: ${after[5]}`);
  console.log(`  ListingSource: ${after[6]}`);

  if (after[0] !== 1 || !after[7] || after[7].id !== created.id) {
    console.error("STOP: post-create organization verification failed");
    process.exit(2);
  }
  if (
    after[1] !== 0 ||
    after[2] !== 0 ||
    after[3] !== 0 ||
    after[4] !== 0 ||
    after[5] !== 0 ||
    after[6] !== 0
  ) {
    console.error("STOP: unexpected rights/provenance mutation after create");
    process.exit(2);
  }

  console.log("\nSTAGE 6.11G.6B script OK — TRREB directory live; zero listing rights granted.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
