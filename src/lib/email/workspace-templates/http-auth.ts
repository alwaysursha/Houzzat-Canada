import { NextResponse } from "next/server";
import {
  authorizeTenantCommandCentre,
  resolveAdminSurfaceMode,
} from "@/lib/admin/tenant-command-centre-auth";
import { auth } from "@/lib/auth";
import { assertTenantScopedEmailTemplateMutation } from "@/lib/email/workspace-templates/service";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import type { WorkspaceMemberRole } from "@prisma/client";

export type EmailTemplateHttpAuth =
  | {
      ok: true;
      workspaceId: string;
      role: WorkspaceMemberRole;
      userId: string;
    }
  | { ok: false; response: NextResponse };

/**
 * Tenant Command Centre OWNER/ADMIN only.
 * Platform Master Admin surface is rejected so tenant customizations cannot
 * be overwritten accidentally.
 */
export async function requireTenantEmailTemplateAdmin(
  request: Request,
): Promise<EmailTemplateHttpAuth> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const hostname = extractTrustedRequestHostname(request);
  const surface = resolveAdminSurfaceMode(hostname);
  if (surface !== "tenant") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Email templates are managed on the tenant Command Centre surface only",
          code: "TENANT_SURFACE_REQUIRED",
        },
        { status: 403 },
      ),
    };
  }

  const tenant = await authorizeTenantCommandCentre(request, {
    id: session.user.id,
    role: session.user.role ?? "",
  });
  if (!tenant) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const scoped = assertTenantScopedEmailTemplateMutation({
    surface: "tenant",
    workspaceId: tenant.workspaceId,
  });
  if (!scoped.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: scoped.message, code: scoped.code },
        { status: scoped.status },
      ),
    };
  }

  return {
    ok: true,
    workspaceId: scoped.data.workspaceId,
    role: tenant.workspaceRole,
    userId: tenant.userId,
  };
}
