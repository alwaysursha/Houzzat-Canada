import { NextResponse } from "next/server";
import { requireTenantEmailTemplateAdmin } from "@/lib/email/workspace-templates/http-auth";
import { listWorkspaceEmailTemplates } from "@/lib/email/workspace-templates/service";

export const runtime = "nodejs";

/** GET — list master templates + workspace draft/published state (tenant OWNER/ADMIN). */
export async function GET(request: Request) {
  const authz = await requireTenantEmailTemplateAdmin(request);
  if (!authz.ok) return authz.response;

  const result = await listWorkspaceEmailTemplates({
    workspaceId: authz.workspaceId,
    role: authz.role,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, templates: result.data });
}
