/**
 * Server-side live-renderer preview for tenant email templates.
 * Reads editor draft from the request body only — no DB writes, no CRM loads,
 * no email sends. Brand chrome is resolved for the authenticated workspace.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantEmailTemplateAdmin } from "@/lib/email/workspace-templates/http-auth";
import {
  buildEmailTemplatePreviewHtml,
  isEmailTemplatePreviewVariantId,
  listEmailTemplatePreviewVariants,
} from "@/lib/email/workspace-templates/preview";
import { isWorkspaceEmailTemplateType } from "@/lib/email/workspace-templates/registry";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { toMarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

export const runtime = "nodejs";

const contentSchema = z
  .object({
    subject: z.string().max(200).nullable(),
    introText: z.string().max(2000).nullable(),
    bodySections: z
      .object({
        paragraphs: z.array(z.string().max(2000)).max(8).optional(),
      })
      .default({}),
    ctaText: z.string().max(80).nullable(),
    style: z
      .object({
        primaryColor: z.string().max(16).nullable().optional(),
      })
      .default({}),
  })
  .nullable();

const previewBodySchema = z.object({
  content: contentSchema,
  mode: z.enum(["desktop", "mobile"]).optional(),
  variant: z.string().nullable().optional(),
});

type RouteContext = { params: Promise<{ type: string }> };

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

  const parsed = previewBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", code: "INVALID_PAYLOAD" },
      { status: 400 },
    );
  }

  const variantRaw = parsed.data.variant ?? null;
  if (
    variantRaw !== null &&
    (!isEmailTemplatePreviewVariantId(variantRaw) ||
      !listEmailTemplatePreviewVariants(type).some((v) => v.id === variantRaw))
  ) {
    return NextResponse.json(
      { error: "Unknown preview variant", code: "UNKNOWN_VARIANT" },
      { status: 400 },
    );
  }

  // Brand from authenticated tenant host only — never trust client-supplied brand.
  const tenancy = await resolveRequestTenancy(request);
  if (!tenancy.ok || tenancy.workspaceId !== authz.workspaceId) {
    return NextResponse.json(
      { error: "Forbidden", code: "TENANT_MISMATCH" },
      { status: 403 },
    );
  }

  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  const brand = toMarketingPresentationBrand(tenancy, canonicalOrigin);

  const html = buildEmailTemplatePreviewHtml({
    templateType: type,
    content: parsed.data.content,
    brand: {
      displayName: brand.displayName,
      logoUrl: brand.logoUrl,
      primaryColor: brand.colors.primary,
      websiteUrl: brand.canonicalOrigin || brand.publicOrigin,
      footerNote: brand.footerLegalText,
    },
    mode: parsed.data.mode,
    variant: variantRaw && isEmailTemplatePreviewVariantId(variantRaw)
      ? variantRaw
      : null,
  });

  return NextResponse.json({ ok: true, html });
}
