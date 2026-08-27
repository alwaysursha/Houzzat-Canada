import { NextResponse } from "next/server";
import { isTrustedStaffMutationOriginForRequest } from "@/lib/active-workspace";
import { requireAgentUser } from "@/lib/agent";
import { prisma } from "@/lib/prisma";
import { tryTenantStaffContext } from "@/lib/tenancy/tenant-staff-context";
import {
  authorizeTenantCanaryPushDeliveryCanary,
  parseTenantCanaryPushDeliveryBody,
  runTenantCanaryPushDeliveryCanary,
  TENANT_CANARY_WORKSPACE_SLUG,
  type TenantCanaryPushDeliveryResult,
} from "@/lib/workspace-canary/tenant-canary-push-delivery-canary";

export const runtime = "nodejs";

/**
 * Stage 3K.5.8H — Worker-hosted Tenant Canary push delivery canary.
 *
 * Hostname-bound Tenant Canary OWNER/ADMIN only (not global User.role=ADMIN).
 * Body: { mode: "dry-run" | "send", confirm: "tenant-canary-push-delivery" }
 */
export async function POST(request: Request) {
  const user = await requireAgentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTrustedStaffMutationOriginForRequest(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const tenant = await tryTenantStaffContext(request, user);
  const authz = authorizeTenantCanaryPushDeliveryCanary({
    workspaceSlug: tenant?.workspaceSlug ?? null,
    workspaceRole: tenant?.workspaceRole ?? null,
    membershipActive: Boolean(tenant),
  });
  if (!authz.ok) {
    return NextResponse.json(
      {
        error: "Forbidden",
        reason: authz.reason,
        expectedWorkspace: TENANT_CANARY_WORKSPACE_SLUG,
      },
      { status: 403 },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = parseTenantCanaryPushDeliveryBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result: TenantCanaryPushDeliveryResult =
    await runTenantCanaryPushDeliveryCanary(prisma, parsed.value);

  const status =
    result.status === "already_sent"
      ? 200
      : result.status === "dry-run" && result.ok
        ? 200
        : result.status === "sent"
          ? 200
          : result.status === "firebase_missing" || result.status === "blocked"
            ? 409
            : result.status === "failed"
              ? 502
              : 400;

  return NextResponse.json(result, { status });
}
