import { NextResponse } from "next/server";
import { requireTenantEmailTemplateAdmin } from "@/lib/email/workspace-templates/http-auth";
import { isWorkspaceEmailTemplateType } from "@/lib/email/workspace-templates/registry";
import { restoreWorkspaceEmailTemplateDefault } from "@/lib/email/workspace-templates/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ type: string }> };

/** POST — clear published override; live resolution falls back to system defaults. */
export async function POST(request: Request, context: RouteContext) {
  const authz = await requireTenantEmailTemplateAdmin(request);
  if (!authz.ok) return authz.response;

  const { type } = await context.params;
  if (!isWorkspaceEmailTemplateType(type)) {
    return NextResponse.json(
      { error: "Unknown template type", code: "UNKNOWN_TYPE" },
      { status: 404 },
    );
  }

  const result = await restoreWorkspaceEmailTemplateDefault({
    workspaceId: authz.workspaceId,
    role: authz.role,
    actorUserId: authz.userId,
    templateType: type,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, ...result.data });
}
