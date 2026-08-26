/**
 * Stage 3K.2 — Houzzat Tenant #1 seed values (from current production-visible assets).
 */
import { HOUZZAT_WORKSPACE_SLUG } from "../../src/lib/crm-ownership";
import { HOUZZAT_BRANDING_SEED } from "./houzzat-branding-seed";
import { wwwAliasForPrimaryHostname } from "../../src/lib/tenancy/normalize-workspace-hostname";
import { platformHostnameForWorkspaceSlug } from "../../src/lib/tenancy/platform-hostname";
import { listWorkspaceDomainsForProbe } from "../../src/lib/tenancy/workspace-domain-probe";
import {
  brandingMatchesHouzzatSeed,
  isHouzzatPoweredByOnlyDrift,
} from "./houzzat-branding-diff";

export const TENANT_BRANDING_FOUNDATION_CONFIRM = "tenant-branding-foundation";

export const HOUZZAT_PRIMARY_HOSTNAME = "houzzat.com";
export const HOUZZAT_WWW_ALIAS_HOSTNAME = wwwAliasForPrimaryHostname(
  HOUZZAT_PRIMARY_HOSTNAME,
);

const houzzatPlatform = platformHostnameForWorkspaceSlug(HOUZZAT_WORKSPACE_SLUG);
if (!houzzatPlatform.ok) {
  throw new Error(`Houzzat platform hostname: ${houzzatPlatform.error}`);
}
export const HOUZZAT_PLATFORM_HOSTNAME = houzzatPlatform.hostname;

export { HOUZZAT_BRANDING_SEED };

export type FoundationPlanAction =
  | "CREATE"
  | "ALREADY_MATCHES"
  | "DRIFT_STOP"
  | "SKIP";

export type FoundationPlanStep = {
  object: string;
  action: FoundationPlanAction;
  detail: string;
};

export type FoundationPlan = {
  steps: FoundationPlanStep[];
  driftStops: FoundationPlanStep[];
  mutationCount: number;
  workspaceId: string | null;
  workspaceSlug: string;
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

export function parseTenantBrandingFoundationArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, confirm };
}

export function validateTenantBrandingFoundationConfirmation(input: {
  apply: boolean;
  confirm: string | null;
}): string | null {
  if (!input.apply) return null;
  if (input.confirm !== TENANT_BRANDING_FOUNDATION_CONFIRM) {
    return `--apply requires --confirm=${TENANT_BRANDING_FOUNDATION_CONFIRM}`;
  }
  return null;
}

export async function buildTenantBrandingFoundationPlan(
  prisma: import("@prisma/client").PrismaClient,
): Promise<FoundationPlan> {
  const steps: FoundationPlanStep[] = [];
  const workspaceSlug = HOUZZAT_WORKSPACE_SLUG;

  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, slug: true, status: true },
  });

  if (!workspace) {
    steps.push({
      object: "Houzzat Workspace",
      action: "DRIFT_STOP",
      detail: `slug=${workspaceSlug} not found`,
    });
    return {
      steps,
      driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
      mutationCount: 0,
      workspaceId: null,
      workspaceSlug,
    };
  }

  if (workspace.status !== "ACTIVE") {
    steps.push({
      object: "Houzzat Workspace",
      action: "DRIFT_STOP",
      detail: `status=${workspace.status}`,
    });
  } else {
    steps.push({
      object: "Houzzat Workspace",
      action: "ALREADY_MATCHES",
      detail: `slug=${workspaceSlug} id=${prefix(workspace.id)} ACTIVE`,
    });
  }

  let domains: Array<{
    id: string;
    hostname: string;
    kind: "PLATFORM" | "CUSTOM";
    role: string;
    status: string;
    verifiedAt: Date | null;
    workspaceSlug: string;
  }> = [];
  let branding: Awaited<
    ReturnType<typeof prisma.workspaceBranding.findUnique>
  > = null;
  let schemaReady = true;

  try {
    domains = await listWorkspaceDomainsForProbe(
      prisma,
      workspace.id,
      workspaceSlug,
    );
    branding = await prisma.workspaceBranding.findUnique({
      where: { workspaceId: workspace.id },
    });
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code;
    if (code === "P2021") {
      schemaReady = false;
      steps.push({
        object: "Schema migration",
        action: "SKIP",
        detail:
          "WorkspaceDomain/WorkspaceBranding tables not applied — run 3K.2 migration before seed apply",
      });
    } else {
      throw error;
    }
  }

  if (!schemaReady) {
    steps.push({
      object: "Houzzat platform domain",
      action: "CREATE",
      detail: `${HOUZZAT_PLATFORM_HOSTNAME} PLATFORM ACTIVE (pending migration)`,
    });
    steps.push({
      object: "Houzzat custom primary",
      action: "CREATE",
      detail: `${HOUZZAT_PRIMARY_HOSTNAME} CUSTOM PRIMARY ACTIVE (pending migration)`,
    });
    steps.push({
      object: "Houzzat www alias",
      action: "CREATE",
      detail: `${HOUZZAT_WWW_ALIAS_HOSTNAME} ALIAS ACTIVE (pending migration)`,
    });
    steps.push({
      object: "Houzzat branding",
      action: "CREATE",
      detail: `tier=${HOUZZAT_BRANDING_SEED.tier} (pending migration)`,
    });
    return {
      steps,
      driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
      mutationCount: 4,
      workspaceId: workspace.id,
      workspaceSlug,
    };
  }

  const platform = domains.find(
    (d) =>
      d.hostname === HOUZZAT_PLATFORM_HOSTNAME && d.kind === "PLATFORM",
  );
  if (platform && platform.status === "ACTIVE" && platform.verifiedAt) {
    steps.push({
      object: "Houzzat platform domain",
      action: "ALREADY_MATCHES",
      detail: `${HOUZZAT_PLATFORM_HOSTNAME} PLATFORM ACTIVE verified`,
    });
  } else if (platform) {
    steps.push({
      object: "Houzzat platform domain",
      action: "DRIFT_STOP",
      detail: `platform row status=${platform.status} verified=${Boolean(platform.verifiedAt)}`,
    });
  } else {
    steps.push({
      object: "Houzzat platform domain",
      action: "CREATE",
      detail: `${HOUZZAT_PLATFORM_HOSTNAME} PLATFORM ACTIVE (trusted seed)`,
    });
  }

  const primary = domains.find(
    (d) =>
      d.hostname === HOUZZAT_PRIMARY_HOSTNAME &&
      d.kind === "CUSTOM" &&
      d.role === "PRIMARY",
  );
  if (
    primary &&
    primary.status === "ACTIVE" &&
    primary.verifiedAt
  ) {
    steps.push({
      object: "Houzzat custom primary",
      action: "ALREADY_MATCHES",
      detail: `${HOUZZAT_PRIMARY_HOSTNAME} CUSTOM PRIMARY ACTIVE verified`,
    });
  } else if (primary) {
    steps.push({
      object: "Houzzat custom primary",
      action: "DRIFT_STOP",
      detail: `custom primary status=${primary.status} verified=${Boolean(primary.verifiedAt)}`,
    });
  } else {
    steps.push({
      object: "Houzzat custom primary",
      action: "CREATE",
      detail: `${HOUZZAT_PRIMARY_HOSTNAME} CUSTOM PRIMARY ACTIVE (trusted migration)`,
    });
  }

  const www = domains.find(
    (d) =>
      d.hostname === HOUZZAT_WWW_ALIAS_HOSTNAME &&
      d.kind === "CUSTOM" &&
      d.role === "ALIAS",
  );
  if (www && www.status === "ACTIVE") {
    steps.push({
      object: "Houzzat www alias",
      action: "ALREADY_MATCHES",
      detail: `${HOUZZAT_WWW_ALIAS_HOSTNAME} ALIAS ACTIVE`,
    });
  } else if (www) {
    steps.push({
      object: "Houzzat www alias",
      action: "DRIFT_STOP",
      detail: `www alias status=${www.status}`,
    });
  } else {
    steps.push({
      object: "Houzzat www alias",
      action: "CREATE",
      detail: `${HOUZZAT_WWW_ALIAS_HOSTNAME} ALIAS ACTIVE`,
    });
  }

  const brandingRow = branding;
  if (brandingMatchesHouzzatSeed(brandingRow)) {
    steps.push({
      object: "Houzzat branding",
      action: "ALREADY_MATCHES",
      detail: `displayName=${HOUZZAT_BRANDING_SEED.displayName} tier=${HOUZZAT_BRANDING_SEED.tier}`,
    });
  } else if (brandingRow && isHouzzatPoweredByOnlyDrift(brandingRow)) {
    steps.push({
      object: "Houzzat branding",
      action: "DRIFT_STOP",
      detail:
        "poweredByHouzzatPro DB=false only — run workspace:houzzat-powered-by-alignment",
    });
  } else if (brandingRow) {
    steps.push({
      object: "Houzzat branding",
      action: "DRIFT_STOP",
      detail: "existing row differs from Houzzat seed — manual review required",
    });
  } else {
    steps.push({
      object: "Houzzat branding",
      action: "CREATE",
      detail: `tier=${HOUZZAT_BRANDING_SEED.tier} colors=${HOUZZAT_BRANDING_SEED.primaryColor}`,
    });
  }

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  const mutationCount = steps.filter((s) => s.action === "CREATE").length;

  return {
    steps,
    driftStops,
    mutationCount,
    workspaceId: workspace.id,
    workspaceSlug,
  };
}

export function formatTenantBrandingFoundationReport(
  plan: FoundationPlan,
  mode: "dry-run" | "apply-preview" = "dry-run",
): string {
  const lines: string[] = ["TENANT BRANDING FOUNDATION PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  if (plan.driftStops.length > 0) {
    lines.push(`DRIFT_STOP count: ${plan.driftStops.length}`);
  }
  lines.push("");
  lines.push(
    mode === "apply-preview"
      ? "APPLY PREVIEW — mutations execute next if gates pass"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

export async function executeTenantBrandingFoundationApply(
  prisma: import("@prisma/client").PrismaClient,
  workspaceId: string,
): Promise<FoundationPlanStep[]> {
  const applied: FoundationPlanStep[] = [];
  const now = new Date();

  const existingPlatform = await prisma.workspaceDomain.findFirst({
    where: { workspaceId, kind: "PLATFORM" },
  });
  if (!existingPlatform) {
    await prisma.workspaceDomain.create({
      data: {
        workspaceId,
        hostname: HOUZZAT_PLATFORM_HOSTNAME,
        kind: "PLATFORM",
        role: "PRIMARY",
        status: "ACTIVE",
        verifiedAt: now,
      },
    });
    applied.push({
      object: "Houzzat platform domain",
      action: "CREATE",
      detail: HOUZZAT_PLATFORM_HOSTNAME,
    });
  }

  const existingCustomPrimary = await prisma.workspaceDomain.findFirst({
    where: {
      workspaceId,
      kind: "CUSTOM",
      role: "PRIMARY",
    },
  });
  if (!existingCustomPrimary) {
    await prisma.workspaceDomain.create({
      data: {
        workspaceId,
        hostname: HOUZZAT_PRIMARY_HOSTNAME,
        kind: "CUSTOM",
        role: "PRIMARY",
        status: "ACTIVE",
        verifiedAt: now,
      },
    });
    applied.push({
      object: "Houzzat custom primary",
      action: "CREATE",
      detail: HOUZZAT_PRIMARY_HOSTNAME,
    });
  }

  const existingWww = await prisma.workspaceDomain.findUnique({
    where: { hostname: HOUZZAT_WWW_ALIAS_HOSTNAME },
  });
  if (!existingWww) {
    await prisma.workspaceDomain.create({
      data: {
        workspaceId,
        hostname: HOUZZAT_WWW_ALIAS_HOSTNAME,
        kind: "CUSTOM",
        role: "ALIAS",
        status: "ACTIVE",
        verifiedAt: now,
      },
    });
    applied.push({
      object: "Houzzat www alias",
      action: "CREATE",
      detail: HOUZZAT_WWW_ALIAS_HOSTNAME,
    });
  }

  const existingBranding = await prisma.workspaceBranding.findUnique({
    where: { workspaceId },
  });
  if (!existingBranding) {
    await prisma.workspaceBranding.create({
      data: {
        workspaceId,
        ...HOUZZAT_BRANDING_SEED,
      },
    });
    applied.push({
      object: "Houzzat branding",
      action: "CREATE",
      detail: HOUZZAT_BRANDING_SEED.displayName,
    });
  }

  return applied;
}
