import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantEmailTemplateAdmin } from "@/lib/email/workspace-templates/http-auth";
import { isWorkspaceEmailTemplateType } from "@/lib/email/workspace-templates/registry";
import {
  getWorkspaceEmailTemplate,
  saveWorkspaceEmailTemplateDraft,
} from "@/lib/email/workspace-templates/service";

export const runtime = "nodejs";

const draftSchema = z.object({
  subject: z.string().max(200).nullable().optional(),
  introText: z.string().max(2000).nullable().optional(),
  bodySections: z
    .object({
      paragraphs: z.array(z.string().max(2000)).max(8).optional(),
    })
    .nullable()
    .optional(),
  ctaText: z.string().max(80).nullable().optional(),
  style: z
    .object({
      primaryColor: z.string().max(16).nullable().optional(),
    })
    .nullable()
    .optional(),
});

type RouteContext = { params: Promise<{ type: string }> };

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

  const result = await getWorkspaceEmailTemplate({
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
  return NextResponse.json({ ok: true, ...result.data });
}

/** PUT — save draft only (never affects live sending until publish + future cutover). */
export async function PUT(request: Request, context: RouteContext) {
  const authz = await requireTenantEmailTemplateAdmin(request);
  if (!authz.ok) return authz.response;

  const { type } = await context.params;
  if (!isWorkspaceEmailTemplateType(type)) {
    return NextResponse.json(
      { error: "Unknown template type", code: "UNKNOWN_TYPE" },
      { status: 404 },
    );
  }

  const parsed = draftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", code: "INVALID_PAYLOAD" },
      { status: 400 },
    );
  }

  const result = await saveWorkspaceEmailTemplateDraft({
    workspaceId: authz.workspaceId,
    role: authz.role,
    actorUserId: authz.userId,
    templateType: type,
    draft: parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, record: result.data });
}
