/**
 * Stage 6.11B.1 — host-bound OWNER template preview API.
 * Actions: start | exit | apply (apply = save via existing persistence + clear).
 */
import { cookies } from "next/headers";
import {
  OwnerActivationError,
  requireHostBoundOwnerOnboardingContext,
  updateOwnerOnboardingTemplateTheme,
} from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";
import {
  OWNER_TEMPLATE_PREVIEW_COOKIE,
  OWNER_TEMPLATE_PREVIEW_TTL_SEC,
  ownerTemplatePreviewCookieOptions,
  previewDisplayLabel,
  signOwnerTemplatePreviewCookie,
  verifyOwnerTemplatePreviewCookie,
} from "@/lib/tenancy/owner-template-preview";
import { requireValidPreviewableThemeId } from "@/lib/tenancy/templates";
import { isTrustedStaffMutationOriginForRequest } from "@/lib/active-workspace";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isTrustedStaffMutationOriginForRequest(request)) {
      return platformError(403, "ORIGIN_DENIED", "Untrusted origin");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const clientWorkspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : null;

    const ctx = await requireHostBoundOwnerOnboardingContext({
      request,
      clientWorkspaceId,
    });

    if (action === "start") {
      let themeId: string;
      try {
        themeId = requireValidPreviewableThemeId(body.themeId);
      } catch {
        throw new OwnerActivationError(
          "Invalid website theme",
          "INVALID_THEME_ID",
          400,
        );
      }

      const signed = signOwnerTemplatePreviewCookie({
        workspaceId: ctx.workspaceId,
        themeId,
      });
      const jar = await cookies();
      jar.set(
        OWNER_TEMPLATE_PREVIEW_COOKIE,
        signed,
        ownerTemplatePreviewCookieOptions(OWNER_TEMPLATE_PREVIEW_TTL_SEC),
      );

      const payload = verifyOwnerTemplatePreviewCookie(signed);
      return platformOk({
        preview: payload
          ? {
              themeId: payload.themeId,
              templateLabel: previewDisplayLabel(payload),
              expiresAtUnix: payload.expiresAtUnix,
            }
          : null,
        redirectTo: "/",
      });
    }

    if (action === "exit") {
      const jar = await cookies();
      jar.set(OWNER_TEMPLATE_PREVIEW_COOKIE, "", {
        ...ownerTemplatePreviewCookieOptions(0),
        maxAge: 0,
      });
      return platformOk({ preview: null, redirectTo: "/" });
    }

    if (action === "apply") {
      // Prefer body.themeId; else cookie for this workspace only.
      let themeId: string | null =
        typeof body.themeId === "string" ? body.themeId : null;
      if (!themeId) {
        const jar = await cookies();
        const raw = jar.get(OWNER_TEMPLATE_PREVIEW_COOKIE)?.value ?? null;
        const payload = verifyOwnerTemplatePreviewCookie(raw);
        if (payload && payload.workspaceId === ctx.workspaceId) {
          themeId = payload.themeId;
        }
      }
      if (!themeId) {
        throw new OwnerActivationError(
          "No preview theme to apply",
          "INVALID_THEME_ID",
          400,
        );
      }

      const updated = await updateOwnerOnboardingTemplateTheme({
        request,
        clientWorkspaceId,
        themeId,
      });

      const jar = await cookies();
      jar.set(OWNER_TEMPLATE_PREVIEW_COOKIE, "", {
        ...ownerTemplatePreviewCookieOptions(0),
        maxAge: 0,
      });

      return platformOk({ workspace: updated, preview: null, redirectTo: "/" });
    }

    return platformError(400, "INVALID_ACTION", "Unsupported preview action");
  } catch (error) {
    if (error instanceof OwnerActivationError) {
      return platformError(error.status, error.code, error.message);
    }
    return platformError(500, "INTERNAL_ERROR", "Unable to update preview");
  }
}
