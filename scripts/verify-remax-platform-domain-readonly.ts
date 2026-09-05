/**
 * Read-only post-backfill resolver check for RE/MAX platform domain.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { resolveWorkspaceFromHostname } from "@/lib/tenancy/resolve-workspace-host";
import { clearHostResolutionCacheForTests } from "@/lib/tenancy/resolve-workspace-host";
import { resolveMobileWorkspaceCanonicalHost } from "@/lib/mobile/mobile-workspace-handoff";
import { platformHostnameForWorkspaceSlug } from "@/lib/tenancy/platform-hostname";

const TARGET = "cmtn5glsq0005psp7z8wk891q";
const RAND = `wildcard-remax-backfill-${Math.random().toString(16).slice(2, 10)}.houzzatpro.com`;

async function main() {
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  clearHostResolutionCacheForTests();

  const rem = await resolveWorkspaceFromHostname("re-max-realty.houzzatpro.com");
  console.log("RESOLVE_REMAX", rem);

  clearHostResolutionCacheForTests();
  const unknown = await resolveWorkspaceFromHostname(RAND);
  console.log("RESOLVE_RANDOM", { host: RAND, result: unknown });

  const handoff = await resolveMobileWorkspaceCanonicalHost(
    TARGET,
    "re-max-realty",
  );
  const derived = platformHostnameForWorkspaceSlug("re-max-realty");
  console.log("HANDOFF_TARGET", handoff);
  console.log("DERIVED_HOSTNAME", derived);

  const { prisma } = await import("../src/lib/prisma");
  const branding = await prisma.workspaceBranding.findUnique({
    where: { workspaceId: TARGET },
    select: { displayName: true, themeId: true, tier: true },
  });
  console.log("BRANDING", branding);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
