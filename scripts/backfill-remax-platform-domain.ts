/**
 * Stage 6.10B — one-time RE/MAX PLATFORM WorkspaceDomain backfill.
 *
 *   pnpm exec tsx scripts/backfill-remax-platform-domain.ts
 *   pnpm exec tsx scripts/backfill-remax-platform-domain.ts --confirm-production-write
 *
 * Uses ensureWorkspacePlatformDomain only. Not a provisioning rerun.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { ensureWorkspacePlatformDomain } from "@/lib/platform/provisioning/create-platform-domain";
import {
  assertHostnameClaimable,
  assertPlatformDomainMatchesSlug,
} from "@/lib/tenancy/reserved-domains";
import { platformHostnameForWorkspaceSlug } from "@/lib/tenancy/platform-hostname";

const TARGET_WORKSPACE_ID = "cmtn5glsq0005psp7z8wk891q";
const TARGET_SLUG = "re-max-realty";
const TARGET_HOSTNAME = "re-max-realty.houzzatpro.com";

async function main() {
  const confirm = process.argv.includes("--confirm-production-write");
  const { prisma } = await import("../src/lib/prisma");

  console.log("=== Stage 6.10B — RE/MAX platform domain backfill ===");

  const workspace = await prisma.workspace.findUnique({
    where: { id: TARGET_WORKSPACE_ID },
    select: { id: true, slug: true, status: true },
  });
  if (!workspace) {
    console.error("STOP: workspace missing");
    process.exit(2);
  }
  if (workspace.id !== TARGET_WORKSPACE_ID) {
    console.error("STOP: workspaceId mismatch");
    process.exit(2);
  }
  if (workspace.slug !== TARGET_SLUG) {
    console.error("STOP: slug mismatch", workspace.slug);
    process.exit(2);
  }
  if (workspace.status !== "ACTIVE") {
    console.error("STOP: workspace not ACTIVE", workspace.status);
    process.exit(2);
  }

  const domainCount = await prisma.workspaceDomain.count({
    where: { workspaceId: TARGET_WORKSPACE_ID },
  });
  const platformCount = await prisma.workspaceDomain.count({
    where: { workspaceId: TARGET_WORKSPACE_ID, kind: "PLATFORM" },
  });
  const owned = await prisma.workspaceDomain.findUnique({
    where: { hostname: TARGET_HOSTNAME },
    select: { id: true, workspaceId: true, hostname: true },
  });

  console.log("precheck", {
    workspaceId: workspace.id,
    slug: workspace.slug,
    status: workspace.status,
    domainCount,
    platformCount,
    hostnameOwner: owned,
  });

  if (domainCount !== 0 || platformCount !== 0) {
    console.error("STOP: workspace already has WorkspaceDomain row(s)");
    process.exit(2);
  }
  if (owned) {
    console.error("STOP: hostname already owned", owned);
    process.exit(2);
  }

  const derived = platformHostnameForWorkspaceSlug(TARGET_SLUG);
  if (!derived.ok || derived.hostname !== TARGET_HOSTNAME) {
    console.error("STOP: platform hostname derivation failed", derived);
    process.exit(2);
  }
  const claim = assertHostnameClaimable({
    hostname: TARGET_HOSTNAME,
    kind: "PLATFORM",
    workspaceSlug: TARGET_SLUG,
    trustedPlatformSeed: true,
  });
  const match = assertPlatformDomainMatchesSlug({
    hostname: TARGET_HOSTNAME,
    workspaceSlug: TARGET_SLUG,
  });
  if (claim || match) {
    console.error("STOP: authority failed", { claim, match });
    process.exit(2);
  }

  console.log("AUTHORITY_OK", { hostname: TARGET_HOSTNAME });

  if (!confirm) {
    console.log(
      "DRY RUN — pass --confirm-production-write to create the domain row",
    );
    return;
  }

  const result = await ensureWorkspacePlatformDomain({
    prisma,
    workspaceId: TARGET_WORKSPACE_ID,
  });
  console.log("RESULT", result);

  if (result.outcome === "failed") {
    process.exit(3);
  }

  const row = await prisma.workspaceDomain.findUnique({
    where: { hostname: TARGET_HOSTNAME },
  });
  console.log("ROW", {
    id: row?.id,
    workspaceId: row?.workspaceId,
    hostname: row?.hostname,
    kind: row?.kind,
    role: row?.role,
    status: row?.status,
    verifiedAt: row?.verifiedAt?.toISOString() ?? null,
    verificationToken: row?.verificationToken,
  });

  const afterCount = await prisma.workspaceDomain.count({
    where: { workspaceId: TARGET_WORKSPACE_ID },
  });
  console.log("REMAX_DOMAIN_COUNT", afterCount);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
