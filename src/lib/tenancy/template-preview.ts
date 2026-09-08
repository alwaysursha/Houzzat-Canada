/**
 * Stage 6.11B.1 — template preview resolution (OWNER cookie primary).
 *
 * Production: ONLY signed OWNER preview cookie (workspace-bound).
 * Development: optional local query/env tooling (NODE_ENV=development only).
 * Never use ALLOW_TEMPLATE_PREVIEW / HOUZZAT_TEMPLATE_PREVIEW in production.
 */
import { cookies } from "next/headers";
import {
  OWNER_TEMPLATE_PREVIEW_COOKIE,
  previewDisplayLabel,
  resolveOwnerTemplatePreviewThemeIdForWorkspace,
  type OwnerTemplatePreviewPayload,
} from "@/lib/tenancy/owner-template-preview";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  TEAM_SIGNATURE_TEMPLATE_ID,
  getTemplate,
  getThemeById,
  parseThemeId,
  type ImplementedTemplateId,
} from "@/lib/tenancy/templates";

/** @deprecated Unsafe production unlock — ignored. Kept for test detection. */
export const UNSAFE_ALLOW_TEMPLATE_PREVIEW_ENV = "ALLOW_TEMPLATE_PREVIEW";
/** @deprecated Process-wide override — development only. */
export const DEV_HOUZZAT_TEMPLATE_PREVIEW_ENV = "HOUZZAT_TEMPLATE_PREVIEW";

function normalizeCatalogThemeId(raw: string): string | null {
  const direct = getThemeById(raw);
  if (direct) {
    const parsed = parseThemeId(direct.id);
    if (!parsed) return null;
    const template = getTemplate(parsed.templateId);
    // Previewable when presentation is ready.
    if (!template?.presentationReady) return null;
    return direct.id;
  }
  const asTemplate = raw as ImplementedTemplateId;
  const byId = getTemplate(asTemplate);
  if (byId?.presentationReady) {
    return byId.themes[0]?.id ?? null;
  }
  if (raw === "agent") {
    return getTemplate(AGENT_SIGNATURE_TEMPLATE_ID)?.themes[0]?.id ?? null;
  }
  if (raw === "team") {
    return getTemplate(TEAM_SIGNATURE_TEMPLATE_ID)?.themes[0]?.id ?? null;
  }
  if (raw === "default") {
    return getTemplate(DEFAULT_TEMPLATE_ID)?.themes[0]?.id ?? null;
  }
  return null;
}

/**
 * Development-only local tooling. Always null in production builds.
 * Does not unlock via ALLOW_TEMPLATE_PREVIEW.
 */
export function resolveDevOnlyTemplatePreviewThemeId(
  requestUrl: string | null | undefined,
): string | null {
  if (process.env.NODE_ENV === "production") return null;

  const envPreview = process.env.HOUZZAT_TEMPLATE_PREVIEW?.trim();
  if (envPreview) return normalizeCatalogThemeId(envPreview);

  if (!requestUrl) return null;
  try {
    const url = new URL(requestUrl);
    const raw = url.searchParams.get("previewTemplate")?.trim();
    if (!raw) return null;
    return normalizeCatalogThemeId(raw);
  } catch {
    return null;
  }
}

export type ResolvedTemplatePreview = {
  themeId: string;
  payload: OwnerTemplatePreviewPayload | null;
  source: "owner_cookie" | "dev_only";
  displayLabel: string;
};

/**
 * Resolve active template preview for a hostname-resolved workspace.
 * Prefer OWNER cookie; fall back to strict development tooling.
 */
export async function resolveActiveTemplatePreviewForWorkspace(
  workspaceId: string,
): Promise<ResolvedTemplatePreview | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(OWNER_TEMPLATE_PREVIEW_COOKIE)?.value ?? null;
    const payload = resolveOwnerTemplatePreviewThemeIdForWorkspace(
      raw,
      workspaceId,
    );
    if (payload) {
      return {
        themeId: payload.themeId,
        payload,
        source: "owner_cookie",
        displayLabel: previewDisplayLabel(payload),
      };
    }
  } catch {
    /* cookies unavailable */
  }

  // Production: no unauthenticated query/env path.
  if (process.env.NODE_ENV === "production") return null;

  const devTheme = resolveDevOnlyTemplatePreviewThemeId(null);
  // Env-only in this path; query requires URL (dev scripts).
  if (devTheme) {
    const theme = getThemeById(devTheme);
    if (!theme) return null;
    const parsed = parseThemeId(theme.id);
    if (!parsed) return null;
    return {
      themeId: theme.id,
      payload: null,
      source: "dev_only",
      displayLabel:
        parsed.templateId === "agent-signature"
          ? "Agent Signature"
          : parsed.templateId === "team-signature"
            ? "Team Signature"
            : theme.label,
    };
  }

  return null;
}

/** Test helper — sync cookie verify against workspace. */
export function resolveTemplatePreviewThemeIdFromCookieForTests(
  cookieValue: string | null | undefined,
  workspaceId: string,
): string | null {
  return (
    resolveOwnerTemplatePreviewThemeIdForWorkspace(cookieValue, workspaceId)
      ?.themeId ?? null
  );
}
