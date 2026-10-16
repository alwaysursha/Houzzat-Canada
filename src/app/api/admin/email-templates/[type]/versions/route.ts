import { NextResponse } from "next/server";
import { requireTenantEmailTemplateAdmin } from "@/lib/email/workspace-templates/http-auth";
import { isWorkspaceEmailTemplateType } from "@/lib/email/workspace-templates/registry";
import { listWorkspaceEmailTemplateVersions } from "@/lib/email/workspace-templates/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ type: string }> };

/** GET — published version history for one template type (workspace-scoped). */
export async function GET(request: Request, context: RouteContext) {
  const authz = await requireTenantEmailTemplateAdmin(request);
  if (!authz.ok) return authz.response;

  const { type } = await context.params;
  if (!isWorkspaceEmailTemplateType(type)) {
    return NextResponse.json(
      { error: "Unknown template type", code: "UNKNOWN_TYPE" },
      { status: 404 },
    );
  }

  const result = await listWorkspaceEmailTemplateVersions({
    workspaceId: authz.workspaceId,
    role: authz.role,
    templateType: type,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, versions: result.data });
}
