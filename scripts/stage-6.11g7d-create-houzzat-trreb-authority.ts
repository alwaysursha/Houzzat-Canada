/**
 * Stage 6.11G.7D — create Houzzat VERIFIED TRREB membership + ACTIVE PropTx
 * DataConnection + dataset capabilities.
 *
 *   pnpm stage-6.11g7d-create-houzzat-trreb-authority
 *   pnpm stage-6.11g7d-create-houzzat-trreb-authority -- --confirm-production-write
 *
 * Idempotent:
 * - absent → create
 * - present + exact canonical match → no-op
 * - present + field conflict → STOP (no update)
 *
 * Enforces membership-before-ACTIVE-connection.
 * No $transaction / updateMany. No listing provenance mutation.
 * credentialRef is opaque only — never raw PropTx secrets.
 * Does NOT wire MLS entitlement or deploy Workers.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const HOUZZAT_WORKSPACE_ID = "cmt7kfcth0000gvu0bqsycsvz";
const TRREB_ORGANIZATION_ID = "cmtrdf23t000091u0cw3a5zu9";
const TRREB_SLUG = "ca-on-trreb";
const PROVIDER_KEY = "proptx";
const CREDENTIAL_REF = "platform-env:proptx";

const CANONICAL_CAPABILITIES = [
  "ACTIVE_LISTINGS",
  "SOLD",
  "HISTORY",
  "OPEN_HOUSES",
  "MEDIA",
] as const;

type CapabilityKind = (typeof CANONICAL_CAPABILITIES)[number];

type MembershipRow = {
  id: string;
  workspaceId: string;
  organizationId: string;
  membershipIdentifier: string | null;
  status: string;
};

type ConnectionRow = {
  id: string;
  workspaceId: string;
  organizationId: string;
  providerKey: string;
  status: string;
  credentialRef: string | null;
  externalConnectionIdentifier: string | null;
  lastVerifiedAt: Date | null;
  lastSuccessfulAccessAt: Date | null;
  lastErrorCode: string | null;
};

function membershipConflicts(existing: MembershipRow): string[] {
  const diffs: string[] = [];
  if (existing.workspaceId !== HOUZZAT_WORKSPACE_ID) {
    diffs.push(`workspaceId: expected ${HOUZZAT_WORKSPACE_ID}, got ${existing.workspaceId}`);
  }
  if (existing.organizationId !== TRREB_ORGANIZATION_ID) {
    diffs.push(
      `organizationId: expected ${TRREB_ORGANIZATION_ID}, got ${existing.organizationId}`,
    );
  }
  if (existing.membershipIdentifier !== null) {
    diffs.push(
      `membershipIdentifier: expected null, got ${JSON.stringify(existing.membershipIdentifier)}`,
    );
  }
  if (existing.status !== "VERIFIED") {
    diffs.push(`status: expected "VERIFIED", got ${JSON.stringify(existing.status)}`);
  }
  return diffs;
}

function connectionConflicts(existing: ConnectionRow): string[] {
  const diffs: string[] = [];
  const expected: Array<[keyof ConnectionRow, unknown]> = [
    ["workspaceId", HOUZZAT_WORKSPACE_ID],
    ["organizationId", TRREB_ORGANIZATION_ID],
    ["providerKey", PROVIDER_KEY],
    ["status", "ACTIVE"],
    ["credentialRef", CREDENTIAL_REF],
    ["externalConnectionIdentifier", null],
    ["lastVerifiedAt", null],
    ["lastSuccessfulAccessAt", null],
    ["lastErrorCode", null],
  ];
  for (const [key, want] of expected) {
    const actual = existing[key];
    if (actual instanceof Date) {
      diffs.push(`${key}: expected null, got ${actual.toISOString()}`);
      continue;
    }
    if (actual !== want) {
      diffs.push(`${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`);
    }
  }
  return diffs;
}

function looksLikeSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v === CREDENTIAL_REF) return false;
  return (
    /bearer|token|password|secret|api[_-]?key/i.test(v) ||
    v.length > 80 ||
    /^eyJ/.test(v)
  );
}

async function main() {
  const confirm = process.argv.includes("--confirm-production-write");
  const { prisma } = await import("../src/lib/prisma");

  console.log("=== STAGE 6.11G.7D — HOUZZAT TRREB AUTHORITY ===\n");

  const workspace = await prisma.workspace.findUnique({
    where: { id: HOUZZAT_WORKSPACE_ID },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!workspace || workspace.status !== "ACTIVE") {
    console.error("STOP: Houzzat workspace missing or not ACTIVE");
    console.error(JSON.stringify(workspace, null, 2));
    process.exit(2);
  }
  console.log("Workspace OK:", JSON.stringify(workspace));

  const trreb = await prisma.realEstateOrganization.findUnique({
    where: { id: TRREB_ORGANIZATION_ID },
    select: {
      id: true,
      slug: true,
      active: true,
      supportStatus: true,
      name: true,
    },
  });
  if (
    !trreb ||
    trreb.slug !== TRREB_SLUG ||
    trreb.active !== true ||
    trreb.supportStatus !== "SUPPORTED"
  ) {
    console.error("STOP: TRREB organization pre-check failed");
    console.error(JSON.stringify(trreb, null, 2));
    process.exit(2);
  }
  console.log("TRREB OK:", JSON.stringify(trreb));

  const [
    memCount,
    connCount,
    capCount,
    listingsWithOrg,
    listingsWithProvider,
    sourceCount,
    existingMembership,
    existingConnection,
  ] = await Promise.all([
    prisma.workspaceRealEstateOrganizationMembership.count(),
    prisma.workspaceDataConnection.count(),
    prisma.workspaceDataConnectionCapability.count(),
    prisma.listing.count({ where: { organizationId: { not: null } } }),
    prisma.listing.count({ where: { providerKey: { not: null } } }),
    prisma.listingSource.count(),
    prisma.workspaceRealEstateOrganizationMembership.findUnique({
      where: {
        workspaceId_organizationId: {
          workspaceId: HOUZZAT_WORKSPACE_ID,
          organizationId: TRREB_ORGANIZATION_ID,
        },
      },
    }),
    prisma.workspaceDataConnection.findUnique({
      where: {
        workspaceId_organizationId_providerKey: {
          workspaceId: HOUZZAT_WORKSPACE_ID,
          organizationId: TRREB_ORGANIZATION_ID,
          providerKey: PROVIDER_KEY,
        },
      },
    }),
  ]);

  console.log("\nPre-check counts:");
  console.log(`  Memberships: ${memCount}`);
  console.log(`  DataConnections: ${connCount}`);
  console.log(`  Capabilities: ${capCount}`);
  console.log(`  Listing.organizationId set: ${listingsWithOrg}`);
  console.log(`  Listing.providerKey set: ${listingsWithProvider}`);
  console.log(`  ListingSource: ${sourceCount}`);

  if (listingsWithOrg !== 0 || listingsWithProvider !== 0 || sourceCount !== 0) {
    console.error("STOP: listing provenance already populated — refuse authority write");
    process.exit(2);
  }

  if (existingMembership) {
    const diffs = membershipConflicts(existingMembership);
    if (diffs.length > 0) {
      console.error("STOP: Houzzat/TRREB membership exists but conflicts:");
      for (const d of diffs) console.error(`  - ${d}`);
      process.exit(2);
    }
  }

  if (existingConnection) {
    const diffs = connectionConflicts(existingConnection);
    if (diffs.length > 0) {
      console.error("STOP: Houzzat/TRREB/proptx connection exists but conflicts:");
      for (const d of diffs) console.error(`  - ${d}`);
      process.exit(2);
    }
    if (looksLikeSecret(existingConnection.credentialRef)) {
      console.error("STOP: existing credentialRef looks like a raw secret");
      process.exit(2);
    }
  }

  // Unexpected rows for other workspace/org pairs — do not silently proceed.
  if (memCount > (existingMembership ? 1 : 0)) {
    console.error(
      `STOP: unexpected membership rows beyond Houzzat/TRREB (count=${memCount})`,
    );
    process.exit(2);
  }
  if (connCount > (existingConnection ? 1 : 0)) {
    console.error(
      `STOP: unexpected DataConnection rows beyond Houzzat/TRREB/proptx (count=${connCount})`,
    );
    process.exit(2);
  }

  if (existingConnection) {
    const caps = await prisma.workspaceDataConnectionCapability.findMany({
      where: { connectionId: existingConnection.id },
      select: { capability: true },
      orderBy: { capability: "asc" },
    });
    const kinds = caps.map((c) => c.capability).sort();
    const expected = [...CANONICAL_CAPABILITIES].sort();
    if (
      kinds.length !== expected.length ||
      kinds.some((k, i) => k !== expected[i])
    ) {
      console.error("STOP: existing capabilities conflict with canonical set:");
      console.error(`  got: ${JSON.stringify(kinds)}`);
      console.error(`  want: ${JSON.stringify(expected)}`);
      process.exit(2);
    }
    if (capCount !== CANONICAL_CAPABILITIES.length) {
      console.error(
        `STOP: capability global count=${capCount} but expected ${CANONICAL_CAPABILITIES.length}`,
      );
      process.exit(2);
    }
  } else if (capCount !== 0) {
    console.error(
      `STOP: capabilities exist without Houzzat/TRREB/proptx connection (count=${capCount})`,
    );
    process.exit(2);
  }

  const alreadyComplete =
    Boolean(existingMembership) &&
    Boolean(existingConnection) &&
    capCount === CANONICAL_CAPABILITIES.length;

  if (alreadyComplete) {
    console.log("\nAlready complete — exact canonical match. No write.");
    console.log("Membership:", JSON.stringify(existingMembership, null, 2));
    console.log("DataConnection:", JSON.stringify(existingConnection, null, 2));
    console.log(`Capabilities: ${CANONICAL_CAPABILITIES.join(", ")}`);
    return;
  }

  if (!confirm) {
    console.log("\nDry-run OK. Re-run with --confirm-production-write to create.");
    console.log("Would ensure:");
    console.log(
      JSON.stringify(
        {
          membership: {
            workspaceId: HOUZZAT_WORKSPACE_ID,
            organizationId: TRREB_ORGANIZATION_ID,
            membershipIdentifier: null,
            status: "VERIFIED",
            present: Boolean(existingMembership),
          },
          connection: {
            workspaceId: HOUZZAT_WORKSPACE_ID,
            organizationId: TRREB_ORGANIZATION_ID,
            providerKey: PROVIDER_KEY,
            status: "ACTIVE",
            credentialRef: CREDENTIAL_REF,
            present: Boolean(existingConnection),
          },
          capabilities: CANONICAL_CAPABILITIES,
        },
        null,
        2,
      ),
    );
    return;
  }

  // --- Membership ---
  let membership = existingMembership;
  if (!membership) {
    membership = await prisma.workspaceRealEstateOrganizationMembership.create({
      data: {
        workspaceId: HOUZZAT_WORKSPACE_ID,
        organizationId: TRREB_ORGANIZATION_ID,
        membershipIdentifier: null,
        status: "VERIFIED",
      },
    });
    console.log("\nCreated membership:", membership.id);
  } else {
    console.log("\nMembership already exact — no-op:", membership.id);
  }

  const membershipReread =
    await prisma.workspaceRealEstateOrganizationMembership.findUnique({
      where: {
        workspaceId_organizationId: {
          workspaceId: HOUZZAT_WORKSPACE_ID,
          organizationId: TRREB_ORGANIZATION_ID,
        },
      },
    });
  if (!membershipReread || membershipConflicts(membershipReread).length > 0) {
    console.error("STOP: membership reread verification failed");
    console.error(JSON.stringify(membershipReread, null, 2));
    process.exit(2);
  }
  if (membershipReread.status !== "VERIFIED") {
    console.error("STOP: cannot create ACTIVE connection without VERIFIED membership");
    process.exit(2);
  }
  console.log("Membership verified before connection:", membershipReread.id);

  // --- DataConnection (requires VERIFIED membership) ---
  let connection = existingConnection;
  if (!connection) {
    connection = await prisma.workspaceDataConnection.create({
      data: {
        workspaceId: HOUZZAT_WORKSPACE_ID,
        organizationId: TRREB_ORGANIZATION_ID,
        providerKey: PROVIDER_KEY,
        status: "ACTIVE",
        credentialRef: CREDENTIAL_REF,
        externalConnectionIdentifier: null,
        lastVerifiedAt: null,
        lastSuccessfulAccessAt: null,
        lastErrorCode: null,
      },
    });
    console.log("Created DataConnection:", connection.id);
  } else {
    console.log("DataConnection already exact — no-op:", connection.id);
  }

  if (looksLikeSecret(connection.credentialRef)) {
    console.error("STOP: credentialRef looks like a raw secret — abort");
    process.exit(2);
  }

  const connectionReread = await prisma.workspaceDataConnection.findUnique({
    where: {
      workspaceId_organizationId_providerKey: {
        workspaceId: HOUZZAT_WORKSPACE_ID,
        organizationId: TRREB_ORGANIZATION_ID,
        providerKey: PROVIDER_KEY,
      },
    },
  });
  if (!connectionReread || connectionConflicts(connectionReread).length > 0) {
    console.error("STOP: DataConnection reread verification failed");
    console.error(JSON.stringify(connectionReread, null, 2));
    process.exit(2);
  }
  console.log("DataConnection verified before capabilities:", connectionReread.id);

  // --- Capabilities (individual creates; no transaction) ---
  for (const capability of CANONICAL_CAPABILITIES) {
    const existingCap = await prisma.workspaceDataConnectionCapability.findUnique({
      where: {
        connectionId_capability: {
          connectionId: connectionReread.id,
          capability,
        },
      },
    });
    if (existingCap) {
      console.log(`Capability ${capability} already present — no-op`);
      continue;
    }
    const createdCap = await prisma.workspaceDataConnectionCapability.create({
      data: {
        connectionId: connectionReread.id,
        capability,
      },
    });
    console.log(`Created capability ${capability}:`, createdCap.id);
  }

  const finalCaps = await prisma.workspaceDataConnectionCapability.findMany({
    where: { connectionId: connectionReread.id },
    select: { id: true, capability: true },
    orderBy: { capability: "asc" },
  });
  const finalKinds = finalCaps.map((c) => c.capability as CapabilityKind).sort();
  const expectedKinds = [...CANONICAL_CAPABILITIES].sort();
  if (
    finalKinds.length !== expectedKinds.length ||
    finalKinds.some((k, i) => k !== expectedKinds[i])
  ) {
    console.error("STOP: final capability set mismatch");
    console.error(JSON.stringify(finalCaps, null, 2));
    process.exit(2);
  }

  const after = await Promise.all([
    prisma.workspaceRealEstateOrganizationMembership.count(),
    prisma.workspaceDataConnection.count(),
    prisma.workspaceDataConnectionCapability.count(),
    prisma.listing.count({ where: { organizationId: { not: null } } }),
    prisma.listing.count({ where: { providerKey: { not: null } } }),
    prisma.listingSource.count(),
    prisma.workspaceRealEstateOrganizationMembership.findUnique({
      where: {
        workspaceId_organizationId: {
          workspaceId: HOUZZAT_WORKSPACE_ID,
          organizationId: TRREB_ORGANIZATION_ID,
        },
      },
    }),
    prisma.workspaceDataConnection.findUnique({
      where: {
        workspaceId_organizationId_providerKey: {
          workspaceId: HOUZZAT_WORKSPACE_ID,
          organizationId: TRREB_ORGANIZATION_ID,
          providerKey: PROVIDER_KEY,
        },
      },
    }),
  ]);

  console.log("\nPost-write:");
  console.log(`  Memberships: ${after[0]}`);
  console.log(`  DataConnections: ${after[1]}`);
  console.log(`  Capabilities: ${after[2]}`);
  console.log(`  Listing.organizationId set: ${after[3]}`);
  console.log(`  Listing.providerKey set: ${after[4]}`);
  console.log(`  ListingSource: ${after[5]}`);
  console.log("Membership:", JSON.stringify(after[6], null, 2));
  console.log("DataConnection:", JSON.stringify(after[7], null, 2));
  console.log(
    "Capabilities:",
    finalCaps.map((c) => c.capability).join(", "),
  );

  if (after[0] !== 1 || after[1] !== 1 || after[2] !== 5) {
    console.error("STOP: unexpected global authority counts after write");
    process.exit(2);
  }
  if (after[3] !== 0 || after[4] !== 0 || after[5] !== 0) {
    console.error("STOP: provenance mutated — unexpected");
    process.exit(2);
  }
  if (!after[6] || membershipConflicts(after[6]).length > 0) {
    console.error("STOP: final membership verification failed");
    process.exit(2);
  }
  if (!after[7] || connectionConflicts(after[7]).length > 0) {
    console.error("STOP: final connection verification failed");
    process.exit(2);
  }
  if (looksLikeSecret(after[7]?.credentialRef)) {
    console.error("STOP: final credentialRef looks like a raw secret");
    process.exit(2);
  }

  console.log(
    "\nSTAGE 6.11G.7D script OK — Houzzat TRREB authority live; no entitlement wiring; provenance untouched.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
