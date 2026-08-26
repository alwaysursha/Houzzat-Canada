/**
 * Stage 3K.4 — Tenant B (tenant-canary) domain + branding canary plan/apply/rollback.
 * Data paths only — callers enforce dry-run / --confirm / scope gates.
 */
import type { PrismaClient } from "@prisma/client";
import { HOUZZAT_WORKSPACE_SLUG } from "../../src/lib/crm-ownership";
import {
  HOUZZAT_PRIMARY_HOSTNAME,
  HOUZZAT_WWW_ALIAS_HOSTNAME,
} from "./tenant-branding-foundation";
import { CANARY_SLUG } from "./tenant-canary-provision";
import { assertHostnameClaimable } from "../../src/lib/tenancy/reserved-domains";
import { normalizeWorkspaceHostname } from "../../src/lib/tenancy/normalize-workspace-hostname";
import {
  findWorkspaceDomainByHostnameForProbe,
  listWorkspaceDomainsForProbe,
  WORKSPACE_DOMAIN_PROBE_SELECT,
} from "../../src/lib/tenancy/workspace-domain-probe";
import { platformHostnameForWorkspaceSlug } from "../../src/lib/tenancy/platform-hostname";

const tenantBPlatform = platformHostnameForWorkspaceSlug(CANARY_SLUG);
if (!tenantBPlatform.ok) {
  throw new Error(`Tenant B platform hostname: ${tenantBPlatform.error}`);
}

/** Canonical HouzzatPro platform hostname for tenant-canary. */
export const TENANT_B_PLATFORM_HOSTNAME = tenantBPlatform.hostname;

/** Legacy interim canary (production) — preserved until platform subdomain routed. */
export const TENANT_B_LEGACY_INTERIM_HOSTNAME = "canary.houzzat.com";

/** @deprecated Use TENANT_B_PLATFORM_HOSTNAME — legacy interim was canary.houzzat.com */
export const TENANT_B_CANARY_PRIMARY_HOSTNAME = TENANT_B_PLATFORM_HOSTNAME;

export const TENANT_B_DOMAIN_BRANDING_CONFIRM =
  "tenant-b-domain-branding-canary";

export const TENANT_B_DOMAIN_BRANDING_ROLLBACK_CONFIRM =
  "tenant-b-domain-branding-canary-rollback";

export const TENANT_B_CANARY_DISPLAY_NAME = "Tenant Canary";

export const TENANT_B_CANARY_BRANDING_SEED = {
  tier: "GENERIC" as const,
  displayName: TENANT_B_CANARY_DISPLAY_NAME,
  tagline: "Internal tenant canary — not a customer site",
  logoUrl: null as string | null,
  brokerageLogoUrl: null as string | null,
  faviconUrl: null as string | null,
  ogImageUrl: null as string | null,
  primaryColor: "#2563EB",
  secondaryColor: "#1E40AF",
  accentColor: "#0EA5E9",
  contactEmail: "canary@houzzat-canary.invalid",
  contactPhone: null as string | null,
  footerLegalText:
    "Synthetic canary workspace for multi-tenant validation only.",
  poweredByHouzzatPro: true,
  seoDescription: "Internal tenant canary — not a customer site",
  version: 1,
};

export const TENANT_B_CANARY_OWNERSHIP_EVIDENCE = [
  "houzzatpro.com zone is HouzzatPro SaaS platform (Worker/marketing surface)",
  "Platform hostnames are system-derived: {workspace-slug}.houzzatpro.com",
  "tenant-canary.houzzatpro.com is deterministic from slug tenant-canary",
  "Custom domains allowed on all tiers — not used for Tenant B canary yet",
  "Legacy canary.houzzat.com preserved until platform subdomain migration (Stage 3K.5+)",
] as const;

export const TENANT_B_CANARY_CLOUDFLARE_REQUIREMENTS = [
  "DNS (houzzatpro.com zone): CNAME tenant-canary.houzzatpro.com → houzzat Worker origin",
  "Workers → houzzat → Domains & Routes: attach tenant-canary.houzzatpro.com",
  "SSL: automatic via Cloudflare managed certificate once DNS + route exist",
  "Platform root houzzatpro.com remains SaaS marketing — never tenant workspace",
  "After verification: DISABLE/DELETE legacy canary.houzzat.com (separate migration stage)",
] as const;

export const TENANT_B_PLATFORM_TRANSITION_PLAN = [
  "A. Apply 3K.4.2 schema migration (kind column + partial indexes)",
  "B. Seed tenant-canary.houzzatpro.com PLATFORM ACTIVE",
  "C. Cloudflare route tenant-canary.houzzatpro.com (Stage 3K.5)",
  "D. Verify host resolution for platform + legacy interim hostname",
  "E. DISABLE then DELETE canary.houzzat.com after platform verified",
  "F. Preserve Tenant B workspace, leads, members, routing throughout",
] as const;

export type CanaryPlanAction =
  | "CREATE"
  | "ALREADY_MATCHES"
  | "DRIFT_STOP"
  | "PRESERVE"
  | "SKIP";

export type CanaryPlanStep = {
  object: string;
  action: CanaryPlanAction;
  detail: string;
};

export type TenantBDomainBrandingPlan = {
  steps: CanaryPlanStep[];
  driftStops: CanaryPlanStep[];
  mutationCount: number;
  workspaceId: string | null;
  workspaceSlug: string;
  primaryHostname: string;
  legacyInterimHostname: string;
  houzzatProtected: string[];
};

export type TenantScopeGateResult = {
  ok: boolean;
  flags: Record<string, string>;
  failures: string[];
  missingAck: boolean;
};

const TENANT_SCOPE_KEYS = [
  "TENANT_DOMAIN_SCOPE",
  "TENANT_BRANDING_SCOPE",
  "TENANT_PUBLIC_LEAD_SCOPE",
  "TENANT_ADMIN_HOST_LOCK",
] as const;

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

function brandingMatchesSeed(
  row: {
    tier: string;
    displayName: string;
    tagline: string | null;
    logoUrl: string | null;
    brokerageLogoUrl: string | null;
    faviconUrl: string | null;
    ogImageUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    footerLegalText: string | null;
    poweredByHouzzatPro: boolean;
    seoDescription: string | null;
    version: number;
  } | null,
): boolean {
  if (!row) return false;
  const s = TENANT_B_CANARY_BRANDING_SEED;
  return (
    row.tier === s.tier &&
    row.displayName === s.displayName &&
    row.tagline === s.tagline &&
    row.logoUrl === s.logoUrl &&
    row.brokerageLogoUrl === s.brokerageLogoUrl &&
    row.faviconUrl === s.faviconUrl &&
    row.ogImageUrl === s.ogImageUrl &&
    row.primaryColor?.toUpperCase() === s.primaryColor.toUpperCase() &&
    row.secondaryColor?.toUpperCase() === s.secondaryColor.toUpperCase() &&
    row.accentColor?.toUpperCase() === s.accentColor.toUpperCase() &&
    row.contactEmail === s.contactEmail &&
    row.contactPhone === s.contactPhone &&
    row.footerLegalText === s.footerLegalText &&
    row.poweredByHouzzatPro === s.poweredByHouzzatPro &&
    row.seoDescription === s.seoDescription &&
    row.version === s.version
  );
}

export function parseTenantBDomainBrandingArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const rollback = argv.includes("--rollback");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, rollback, confirm };
}

export function validateTenantBDomainBrandingConfirmation(input: {
  apply: boolean;
  rollback: boolean;
  confirm: string | null;
}): string | null {
  if (input.rollback && !input.apply) {
    return null;
  }
  if (input.rollback) {
    if (!input.apply) {
      return "--rollback requires --apply";
    }
    if (input.confirm !== TENANT_B_DOMAIN_BRANDING_ROLLBACK_CONFIRM) {
      return `--rollback --apply requires --confirm=${TENANT_B_DOMAIN_BRANDING_ROLLBACK_CONFIRM}`;
    }
    return null;
  }
  if (!input.apply) return null;
  if (input.confirm !== TENANT_B_DOMAIN_BRANDING_CONFIRM) {
    return `--apply requires --confirm=${TENANT_B_DOMAIN_BRANDING_CONFIRM}`;
  }
  return null;
}

/** Apply must keep tenant hostname/branding flags at safe legacy defaults. */
export function verifyTenantScopeGatesLegacy(): TenantScopeGateResult {
  const flags: Record<string, string> = {};
  const failures: string[] = [];

  for (const key of TENANT_SCOPE_KEYS) {
    const raw = process.env[key]?.trim().toLowerCase() ?? "";
    const value =
      key === "TENANT_ADMIN_HOST_LOCK"
        ? raw || "off"
        : raw || "legacy";
    flags[key] = value;
    if (key === "TENANT_ADMIN_HOST_LOCK") {
      if (value === "1" || value === "true" || value === "on") {
        failures.push(`${key}=${value} (must stay off for this stage)`);
      }
    } else if (value !== "legacy") {
      failures.push(`${key}=${value} (expected legacy)`);
    }
  }

  const ack = process.env.CANARY_ACK_PRODUCTION_SCOPES?.trim() === "1";
  const missingAck = failures.length > 0 && !ack;

  return {
    ok: failures.length === 0 || ack,
    flags,
    failures,
    missingAck,
  };
}

export async function buildTenantBDomainBrandingPlan(
  prisma: PrismaClient,
): Promise<TenantBDomainBrandingPlan> {
  const steps: CanaryPlanStep[] = [];
  const houzzatProtected: string[] = [];
  const primaryHostname = TENANT_B_PLATFORM_HOSTNAME;
  const legacyInterimHostname = TENANT_B_LEGACY_INTERIM_HOSTNAME;

  const normalized = normalizeWorkspaceHostname(primaryHostname);
  if (!normalized.ok) {
    steps.push({
      object: "Canary hostname",
      action: "DRIFT_STOP",
      detail: normalized.error,
    });
    return {
      steps,
      driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
      mutationCount: 0,
      workspaceId: null,
      workspaceSlug: CANARY_SLUG,
      primaryHostname,
      houzzatProtected,
      legacyInterimHostname,
    };
  }

  const claimError = assertHostnameClaimable({
    hostname: primaryHostname,
    kind: "PLATFORM",
    workspaceSlug: CANARY_SLUG,
    trustedPlatformSeed: true,
  });
  if (claimError) {
    steps.push({
      object: "Canary hostname",
      action: "DRIFT_STOP",
      detail: claimError,
    });
  } else {
    steps.push({
      object: "Canary hostname",
      action: "ALREADY_MATCHES",
      detail: `${primaryHostname} trusted platform seed for slug=${CANARY_SLUG}`,
    });
  }

  const canary = await prisma.workspace.findUnique({
    where: { slug: CANARY_SLUG },
    select: { id: true, slug: true, status: true },
  });

  if (!canary) {
    steps.push({
      object: "Tenant B workspace",
      action: "DRIFT_STOP",
      detail: `slug=${CANARY_SLUG} not found — provision workspace first`,
    });
    return finalizePlan(
      steps,
      null,
      CANARY_SLUG,
      primaryHostname,
      legacyInterimHostname,
      houzzatProtected,
    );
  }

  if (canary.status !== "ACTIVE") {
    steps.push({
      object: "Tenant B workspace",
      action: "DRIFT_STOP",
      detail: `status=${canary.status}`,
    });
  } else {
    steps.push({
      object: "Tenant B workspace",
      action: "ALREADY_MATCHES",
      detail: `slug=${CANARY_SLUG} id=${prefix(canary.id)} ACTIVE`,
    });
  }

  const houzzat = await prisma.workspace.findUnique({
    where: { slug: HOUZZAT_WORKSPACE_SLUG },
    select: { id: true },
  });

  let schemaReady = true;
  let canaryDomains: Array<{
    id: string;
    hostname: string;
    kind: "PLATFORM" | "CUSTOM";
    role: string;
    status: string;
    workspaceId: string;
    workspaceSlug: string;
  }> = [];
  let globalCanaryHost: Awaited<
    ReturnType<typeof findWorkspaceDomainByHostnameForProbe>
  > = null;
  let houzzatDomains: typeof canaryDomains = [];
  let branding: Awaited<
    ReturnType<typeof prisma.workspaceBranding.findUnique>
  > = null;

  try {
    canaryDomains = await listWorkspaceDomainsForProbe(
      prisma,
      canary.id,
      CANARY_SLUG,
    );
    globalCanaryHost = await findWorkspaceDomainByHostnameForProbe(
      prisma,
      primaryHostname,
      CANARY_SLUG,
    );
    if (houzzat) {
      houzzatDomains = await listWorkspaceDomainsForProbe(
        prisma,
        houzzat.id,
        HOUZZAT_WORKSPACE_SLUG,
      );
    }
    branding = await prisma.workspaceBranding.findUnique({
      where: { workspaceId: canary.id },
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
          "WorkspaceDomain/WorkspaceBranding tables not applied — run 3K.2 migration first",
      });
    } else {
      throw error;
    }
  }

  for (const d of houzzatDomains) {
    houzzatProtected.push(`${d.hostname} ${d.role} ${d.status}`);
    steps.push({
      object: `Houzzat domain ${d.hostname}`,
      action: "PRESERVE",
      detail: `${d.role} ${d.status} — no mutation`,
    });
  }

  if (houzzatDomains.length === 0 && schemaReady) {
    steps.push({
      object: "Houzzat domains",
      action: "SKIP",
      detail: "no rows visible (read-only check only)",
    });
  } else if (!schemaReady) {
    steps.push({
      object: "Houzzat domains",
      action: "PRESERVE",
      detail: `${HOUZZAT_PRIMARY_HOSTNAME} / ${HOUZZAT_WWW_ALIAS_HOSTNAME} must remain untouched`,
    });
  }

  if (!schemaReady) {
    steps.push({
      object: "Tenant B platform domain",
      action: "CREATE",
      detail: `${primaryHostname} PLATFORM ACTIVE (pending migration)`,
    });
    steps.push({
      object: "Tenant B branding",
      action: "CREATE",
      detail: `displayName=${TENANT_B_CANARY_DISPLAY_NAME} tier=GENERIC`,
    });
    return finalizePlan(
      steps,
      canary.id,
      CANARY_SLUG,
      primaryHostname,
      legacyInterimHostname,
      houzzatProtected,
    );
  }

  const legacyInterim = canaryDomains.find(
    (d) => d.hostname === legacyInterimHostname,
  );
  if (legacyInterim) {
    steps.push({
      object: "Tenant B legacy interim domain",
      action: "PRESERVE",
      detail: `${legacyInterimHostname} ${legacyInterim.kind} ${legacyInterim.role} — migrate off in Stage 3K.5+`,
    });
  }

  const otherPlatform = canaryDomains.find(
    (d) => d.kind === "PLATFORM" && d.hostname !== primaryHostname,
  );
  if (otherPlatform) {
    steps.push({
      object: "Tenant B platform domain",
      action: "DRIFT_STOP",
      detail: `unexpected PLATFORM ${otherPlatform.hostname}`,
    });
  }

  if (
    globalCanaryHost &&
    globalCanaryHost.workspaceId !== canary.id
  ) {
    steps.push({
      object: "Tenant B platform domain",
      action: "DRIFT_STOP",
      detail: `${primaryHostname} owned by workspace ${prefix(globalCanaryHost.workspaceId)}`,
    });
  }

  const platform = canaryDomains.find(
    (d) => d.hostname === primaryHostname && d.kind === "PLATFORM",
  );
  if (
    platform &&
    platform.status === "ACTIVE" &&
    platform.workspaceId === canary.id
  ) {
    steps.push({
      object: "Tenant B platform domain",
      action: "ALREADY_MATCHES",
      detail: `${primaryHostname} PLATFORM ACTIVE`,
    });
  } else if (platform) {
    steps.push({
      object: "Tenant B platform domain",
      action: "DRIFT_STOP",
      detail: `platform row status=${platform.status}`,
    });
  } else if (!globalCanaryHost) {
    steps.push({
      object: "Tenant B platform domain",
      action: "CREATE",
      detail: `${primaryHostname} PLATFORM ACTIVE for slug=${CANARY_SLUG}`,
    });
  }

  const unexpectedCustomPrimary = canaryDomains.filter(
    (d) =>
      d.kind === "CUSTOM" &&
      d.role === "PRIMARY" &&
      d.hostname !== legacyInterimHostname,
  );
  for (const row of unexpectedCustomPrimary) {
    steps.push({
      object: `Tenant B custom primary ${row.hostname}`,
      action: "DRIFT_STOP",
      detail: "unexpected CUSTOM PRIMARY — review before apply",
    });
  }

  if (brandingMatchesSeed(branding)) {
    steps.push({
      object: "Tenant B branding",
      action: "ALREADY_MATCHES",
      detail: `displayName=${TENANT_B_CANARY_DISPLAY_NAME} colors=${TENANT_B_CANARY_BRANDING_SEED.primaryColor}`,
    });
  } else if (branding) {
    steps.push({
      object: "Tenant B branding",
      action: "DRIFT_STOP",
      detail: "existing row differs from canary seed — manual review required",
    });
  } else {
    steps.push({
      object: "Tenant B branding",
      action: "CREATE",
      detail: `displayName=${TENANT_B_CANARY_DISPLAY_NAME} tier=GENERIC`,
    });
  }

  return finalizePlan(
    steps,
    canary.id,
    CANARY_SLUG,
    primaryHostname,
    legacyInterimHostname,
    houzzatProtected,
  );
}

function finalizePlan(
  steps: CanaryPlanStep[],
  workspaceId: string | null,
  workspaceSlug: string,
  primaryHostname: string,
  legacyInterimHostname: string,
  houzzatProtected: string[],
): TenantBDomainBrandingPlan {
  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  const mutationCount = steps.filter((s) => s.action === "CREATE").length;
  return {
    steps,
    driftStops,
    mutationCount,
    workspaceId,
    workspaceSlug,
    primaryHostname,
    legacyInterimHostname,
    houzzatProtected,
  };
}

export function formatTenantBDomainBrandingReport(
  plan: TenantBDomainBrandingPlan,
  scopeGates: TenantScopeGateResult,
  mode: "dry-run" | "apply-preview" | "rollback-preview",
): string {
  const lines: string[] = [
    "TENANT B DOMAIN + BRANDING CANARY PLAN",
    "",
    `Proposed PLATFORM: ${plan.primaryHostname}`,
    `Legacy interim (preserve): ${plan.legacyInterimHostname}`,
    `Target workspace: ${plan.workspaceSlug}`,
    "",
    "Platform transition plan:",
    ...TENANT_B_PLATFORM_TRANSITION_PLAN.map((e) => `  - ${e}`),
    "",
    "Ownership evidence:",
    ...TENANT_B_CANARY_OWNERSHIP_EVIDENCE.map((e) => `  - ${e}`),
    "",
  ];

  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }

  lines.push("");
  lines.push(`Houzzat protected domains: ${plan.houzzatProtected.length}`);
  for (const row of plan.houzzatProtected) {
    lines.push(`  PRESERVE ${row}`);
  }

  lines.push("");
  lines.push("Tenant scope flags (must stay legacy/off):");
  for (const [key, value] of Object.entries(scopeGates.flags)) {
    lines.push(`  ${key}=${value}`);
  }
  if (scopeGates.failures.length > 0) {
    lines.push(`  gate failures: ${scopeGates.failures.join("; ")}`);
  }

  lines.push("");
  lines.push("Future Cloudflare (not created in this stage):");
  for (const req of TENANT_B_CANARY_CLOUDFLARE_REQUIREMENTS) {
    lines.push(`  - ${req}`);
  }

  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  if (plan.driftStops.length > 0) {
    lines.push(`DRIFT_STOP count: ${plan.driftStops.length}`);
  }

  lines.push("");
  if (mode === "rollback-preview") {
    lines.push("ROLLBACK PREVIEW — deletes Tenant B canary domain/branding rows only");
  } else if (mode === "apply-preview") {
    lines.push("APPLY PREVIEW — mutations execute next if gates pass");
  } else {
    lines.push("DRY RUN — NO PRODUCTION MUTATIONS");
  }

  return lines.join("\n");
}

export async function executeTenantBDomainBrandingApply(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<CanaryPlanStep[]> {
  const applied: CanaryPlanStep[] = [];
  const now = new Date();
  const hostname = TENANT_B_PLATFORM_HOSTNAME;

  const existingHost = await prisma.workspaceDomain.findUnique({
    where: { hostname },
  });
  if (existingHost) {
    if (
      existingHost.workspaceId !== workspaceId ||
      existingHost.kind !== "PLATFORM" ||
      existingHost.status !== "ACTIVE"
    ) {
      throw new Error(
        `DRIFT_STOP: ${hostname} exists with unexpected shape`,
      );
    }
  } else {
    const otherPlatform = await prisma.workspaceDomain.findFirst({
      where: { workspaceId, kind: "PLATFORM" },
    });
    if (otherPlatform) {
      throw new Error(
        `DRIFT_STOP: tenant-canary already has PLATFORM ${otherPlatform.hostname}`,
      );
    }

    await prisma.workspaceDomain.create({
      data: {
        workspaceId,
        hostname,
        kind: "PLATFORM",
        role: "PRIMARY",
        status: "ACTIVE",
        verifiedAt: now,
      },
    });
    applied.push({
      object: "Tenant B platform domain",
      action: "CREATE",
      detail: hostname,
    });
  }

  const existingBranding = await prisma.workspaceBranding.findUnique({
    where: { workspaceId },
  });
  if (!existingBranding) {
    await prisma.workspaceBranding.create({
      data: {
        workspaceId,
        ...TENANT_B_CANARY_BRANDING_SEED,
      },
    });
    applied.push({
      object: "Tenant B branding",
      action: "CREATE",
      detail: TENANT_B_CANARY_DISPLAY_NAME,
    });
  } else if (!brandingMatchesSeed(existingBranding)) {
    throw new Error("DRIFT_STOP: Tenant B branding row differs from seed");
  }

  return applied;
}

export async function buildTenantBDomainBrandingRollbackPlan(
  prisma: PrismaClient,
): Promise<TenantBDomainBrandingPlan> {
  const steps: CanaryPlanStep[] = [];
  const houzzatProtected: string[] = [];
  const primaryHostname = TENANT_B_PLATFORM_HOSTNAME;
  const legacyInterimHostname = TENANT_B_LEGACY_INTERIM_HOSTNAME;

  const canary = await prisma.workspace.findUnique({
    where: { slug: CANARY_SLUG },
    select: { id: true, slug: true },
  });

  if (!canary) {
    steps.push({
      object: "Tenant B workspace",
      action: "SKIP",
      detail: "tenant-canary not found — nothing to rollback",
    });
    return finalizePlan(
      steps,
      null,
      CANARY_SLUG,
      primaryHostname,
      legacyInterimHostname,
      houzzatProtected,
    );
  }

  const hostRow = await prisma.workspaceDomain.findUnique({
    where: { hostname: primaryHostname },
    select: WORKSPACE_DOMAIN_PROBE_SELECT,
  });
  if (!hostRow) {
    steps.push({
      object: "Tenant B platform domain",
      action: "SKIP",
      detail: `${primaryHostname} not present`,
    });
  } else if (hostRow.workspaceId !== canary.id) {
    steps.push({
      object: "Tenant B platform domain",
      action: "DRIFT_STOP",
      detail: `${primaryHostname} owned by ${prefix(hostRow.workspaceId)} — refuse rollback`,
    });
  } else {
    steps.push({
      object: "Tenant B platform domain",
      action: "DELETE",
      detail: `${primaryHostname} PLATFORM`,
    });
  }

  steps.push({
    object: "Tenant B legacy interim domain",
    action: "PRESERVE",
    detail: `${legacyInterimHostname} not removed by platform rollback`,
  });

  const branding = await prisma.workspaceBranding.findUnique({
    where: { workspaceId: canary.id },
  });
  if (!branding) {
    steps.push({
      object: "Tenant B branding",
      action: "SKIP",
      detail: "no branding row",
    });
  } else if (!brandingMatchesSeed(branding)) {
    steps.push({
      object: "Tenant B branding",
      action: "DRIFT_STOP",
      detail: "branding differs from canary seed — manual rollback only",
    });
  } else {
    steps.push({
      object: "Tenant B branding",
      action: "DELETE",
      detail: TENANT_B_CANARY_DISPLAY_NAME,
    });
  }

  const houzzat = await prisma.workspace.findUnique({
    where: { slug: HOUZZAT_WORKSPACE_SLUG },
    select: { id: true },
  });
  if (houzzat) {
    const houzzatDomains = await listWorkspaceDomainsForProbe(
      prisma,
      houzzat.id,
      HOUZZAT_WORKSPACE_SLUG,
    );
    for (const d of houzzatDomains) {
      houzzatProtected.push(`${d.hostname} ${d.role} ${d.status}`);
    }
  }

  steps.push({
    object: "Houzzat domains/branding",
    action: "PRESERVE",
    detail: "rollback never touches Houzzat tenant rows",
  });

  return finalizePlan(
    steps,
    canary.id,
    CANARY_SLUG,
    primaryHostname,
    legacyInterimHostname,
    houzzatProtected,
  );
}

export async function executeTenantBDomainBrandingRollback(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<CanaryPlanStep[]> {
  const rolledBack: CanaryPlanStep[] = [];
  const hostname = TENANT_B_PLATFORM_HOSTNAME;

  const hostRow = await prisma.workspaceDomain.findUnique({
    where: { hostname },
  });
  if (hostRow) {
    if (hostRow.workspaceId !== workspaceId) {
      throw new Error(
        `DRIFT_STOP: ${hostname} not owned by tenant-canary`,
      );
    }
    await prisma.workspaceDomain.delete({ where: { id: hostRow.id } });
    rolledBack.push({
      object: "Tenant B platform domain",
      action: "DELETE",
      detail: hostname,
    });
  }

  const branding = await prisma.workspaceBranding.findUnique({
    where: { workspaceId },
  });
  if (branding) {
    if (!brandingMatchesSeed(branding)) {
      throw new Error("DRIFT_STOP: branding differs from canary seed");
    }
    await prisma.workspaceBranding.delete({ where: { workspaceId } });
    rolledBack.push({
      object: "Tenant B branding",
      action: "DELETE",
      detail: TENANT_B_CANARY_DISPLAY_NAME,
    });
  }

  return rolledBack;
}
