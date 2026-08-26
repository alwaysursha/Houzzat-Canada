/**
 * Stage 3K.4.4 — guarded Houzzat poweredByHouzzatPro DB alignment (single field).
 */
import { HOUZZAT_WORKSPACE_SLUG } from "../../src/lib/crm-ownership";
import { enforcePoweredByHouzzatPro } from "../../src/lib/tenancy/brand-capabilities";
import { workspaceBrandingRowToBrand } from "../../src/lib/tenancy/resolve-workspace-brand";
import { toWorkspaceBrandPublic } from "../../src/lib/tenancy/brand-dto";
import {
  brandingMatchesHouzzatSeed,
  diffHouzzatBrandingFields,
  getHouzzatBrandingDriftFieldNames,
  HOUZZAT_BRANDING_COMPARABLE_SELECT,
  isHouzzatPoweredByOnlyDrift,
  type HouzzatBrandingFieldDiff,
} from "./houzzat-branding-diff";
import { HOUZZAT_BRANDING_SEED } from "./houzzat-branding-seed";

export const HOUZZAT_POWERED_BY_ALIGNMENT_CONFIRM = "houzzat-powered-by-alignment";

export type PoweredByAlignmentAction =
  | "ALREADY_MATCHES"
  | "UPDATE_REQUIRED"
  | "DRIFT_STOP";

export type PoweredByAlignmentPlan = {
  workspaceId: string | null;
  workspaceSlug: string;
  action: PoweredByAlignmentAction;
  fieldDiff: HouzzatBrandingFieldDiff[];
  runtimePoweredByHouzzatPro: boolean | null;
  mutationCount: number;
  detail: string;
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

export function parseHouzzatPoweredByAlignmentArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, confirm };
}

export function validateHouzzatPoweredByAlignmentConfirmation(input: {
  apply: boolean;
  confirm: string | null;
}): string | null {
  if (!input.apply) return null;
  if (input.confirm !== HOUZZAT_POWERED_BY_ALIGNMENT_CONFIRM) {
    return `--apply requires --confirm=${HOUZZAT_POWERED_BY_ALIGNMENT_CONFIRM}`;
  }
  return null;
}

export function resolveRuntimePoweredByFromRow(
  workspaceId: string,
  row: Parameters<typeof workspaceBrandingRowToBrand>[1],
): boolean {
  const brand = workspaceBrandingRowToBrand(workspaceId, row);
  return toWorkspaceBrandPublic(brand).poweredByHouzzatPro;
}

export async function buildHouzzatPoweredByAlignmentPlan(
  prisma: import("@prisma/client").PrismaClient,
): Promise<PoweredByAlignmentPlan> {
  const workspaceSlug = HOUZZAT_WORKSPACE_SLUG;
  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, slug: true, status: true },
  });

  if (!workspace) {
    return {
      workspaceId: null,
      workspaceSlug,
      action: "DRIFT_STOP",
      fieldDiff: diffHouzzatBrandingFields(null),
      runtimePoweredByHouzzatPro: null,
      mutationCount: 0,
      detail: `slug=${workspaceSlug} not found`,
    };
  }

  if (workspace.status !== "ACTIVE") {
    return {
      workspaceId: workspace.id,
      workspaceSlug,
      action: "DRIFT_STOP",
      fieldDiff: diffHouzzatBrandingFields(null),
      runtimePoweredByHouzzatPro: null,
      mutationCount: 0,
      detail: `workspace status=${workspace.status}`,
    };
  }

  const branding = await prisma.workspaceBranding.findUnique({
    where: { workspaceId: workspace.id },
    select: HOUZZAT_BRANDING_COMPARABLE_SELECT,
  });

  if (!branding) {
    return {
      workspaceId: workspace.id,
      workspaceSlug,
      action: "DRIFT_STOP",
      fieldDiff: diffHouzzatBrandingFields(null),
      runtimePoweredByHouzzatPro: null,
      mutationCount: 0,
      detail: "WorkspaceBranding row missing — use tenant-branding-foundation CREATE",
    };
  }

  const fieldDiff = diffHouzzatBrandingFields(branding);
  const runtimePoweredByHouzzatPro = resolveRuntimePoweredByFromRow(
    workspace.id,
    branding,
  );

  if (brandingMatchesHouzzatSeed(branding)) {
    return {
      workspaceId: workspace.id,
      workspaceSlug,
      action: "ALREADY_MATCHES",
      fieldDiff,
      runtimePoweredByHouzzatPro,
      mutationCount: 0,
      detail: `poweredByHouzzatPro=true id=${prefix(workspace.id)}`,
    };
  }

  if (isHouzzatPoweredByOnlyDrift(branding)) {
    return {
      workspaceId: workspace.id,
      workspaceSlug,
      action: "UPDATE_REQUIRED",
      fieldDiff,
      runtimePoweredByHouzzatPro,
      mutationCount: 1,
      detail: "poweredByHouzzatPro false → true (single-field DB alignment)",
    };
  }

  const otherMismatches = getHouzzatBrandingDriftFieldNames(branding).join(", ");

  return {
    workspaceId: workspace.id,
    workspaceSlug,
    action: "DRIFT_STOP",
    fieldDiff,
    runtimePoweredByHouzzatPro,
    mutationCount: 0,
    detail: `branding drift includes other fields: ${otherMismatches}`,
  };
}

export function formatHouzzatBrandingDiffMatrix(
  fieldDiff: HouzzatBrandingFieldDiff[],
): string {
  const lines = ["field | DB value | expected value | match?"];
  for (const entry of fieldDiff) {
    const db =
      entry.dbValue === null || entry.dbValue === undefined
        ? "null"
        : String(entry.dbValue);
    const expected =
      entry.expectedValue === null || entry.expectedValue === undefined
        ? "null"
        : String(entry.expectedValue);
    lines.push(
      `${entry.field} | ${db} | ${expected} | ${entry.match ? "yes" : "no"}`,
    );
  }
  return lines.join("\n");
}

export function formatHouzzatPoweredByAlignmentReport(
  plan: PoweredByAlignmentPlan,
  mode: "dry-run" | "apply-preview" = "dry-run",
): string {
  const lines: string[] = [
    "HOUZZAT POWERED-BY ALIGNMENT PLAN",
    "",
    "Branding field diff:",
    formatHouzzatBrandingDiffMatrix(plan.fieldDiff),
    "",
    `Houzzat Powered-by invariant: ${plan.action}`,
    `  ${plan.detail}`,
    "",
    `Runtime resolver poweredByHouzzatPro: ${plan.runtimePoweredByHouzzatPro ?? "n/a"}`,
    `Product invariant enforcePoweredByHouzzatPro(stored): ${enforcePoweredByHouzzatPro(false)}`,
    `Seed poweredByHouzzatPro: ${HOUZZAT_BRANDING_SEED.poweredByHouzzatPro}`,
    "",
    `Mutation count if --apply: ${plan.mutationCount}`,
    "",
    mode === "apply-preview"
      ? "APPLY PREVIEW — single-field update executes next if gates pass"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  ];
  return lines.join("\n");
}

export async function executeHouzzatPoweredByAlignmentApply(
  prisma: import("@prisma/client").PrismaClient,
  workspaceId: string,
): Promise<{ updated: boolean; previous: boolean | null }> {
  const existing = await prisma.workspaceBranding.findUnique({
    where: { workspaceId },
    select: HOUZZAT_BRANDING_COMPARABLE_SELECT,
  });

  if (!existing) {
    throw new Error("WorkspaceBranding row missing");
  }

  if (!isHouzzatPoweredByOnlyDrift(existing)) {
    const driftFields = getHouzzatBrandingDriftFieldNames(existing);
    throw new Error(
      `Refusing apply: drift is not poweredByHouzzatPro-only (${driftFields.join(", ")})`,
    );
  }

  if (existing.poweredByHouzzatPro === true) {
    return { updated: false, previous: true };
  }

  await prisma.workspaceBranding.update({
    where: { workspaceId },
    data: { poweredByHouzzatPro: true },
  });

  return { updated: true, previous: false };
}
