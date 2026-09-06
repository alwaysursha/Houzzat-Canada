/**
 * Stage 6.11B.1 — secure OWNER template preview (signed httpOnly cookie).
 *
 * Preview never writes WorkspaceBranding. Authority for start/exit/apply is
 * host-bound ACTIVE OWNER (same pattern as onboarding).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  getTemplate,
  getThemeById,
  parseThemeId,
  requireValidSelectableThemeId,
  type ImplementedTemplateId,
} from "@/lib/tenancy/templates";

export const OWNER_TEMPLATE_PREVIEW_COOKIE = "houzzat_owner_template_preview";
export const OWNER_TEMPLATE_PREVIEW_TTL_SEC = 30 * 60; // 30 minutes
export const OWNER_TEMPLATE_PREVIEW_VERSION = "v1";

const SEP = ".";
const WORKSPACE_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export type OwnerTemplatePreviewPayload = {
  workspaceId: string;
  themeId: string;
  templateId: ImplementedTemplateId;
  templateLabel: string;
  themeLabel: string;
  expiresAtUnix: number;
};

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[owner-template-preview] AUTH_SECRET required");
    }
    return "dev-insecure-owner-template-preview-secret";
  }
  return secret;
}

function signPayload(workspaceId: string, themeId: string, exp: number): string {
  return createHmac("sha256", signingSecret())
    .update(`${workspaceId}|${themeId}|${exp}`)
    .digest("base64url");
}

/** Build signed cookie value. Throws INVALID_THEME_ID / invalid workspace. */
export function signOwnerTemplatePreviewCookie(input: {
  workspaceId: string;
  themeId: string;
  nowMs?: number;
  ttlSec?: number;
}): string {
  if (!WORKSPACE_ID_RE.test(input.workspaceId)) {
    throw new Error("INVALID_WORKSPACE_ID");
  }
  const themeId = requireValidSelectableThemeId(input.themeId);
  const now = input.nowMs ?? Date.now();
  const ttl = input.ttlSec ?? OWNER_TEMPLATE_PREVIEW_TTL_SEC;
  const exp = Math.floor(now / 1000) + ttl;
  const sig = signPayload(input.workspaceId, themeId, exp);
  // themeId contains ":" — encode as base64url segment to keep SEP parsing stable.
  const themeEnc = Buffer.from(themeId, "utf8").toString("base64url");
  return [
    OWNER_TEMPLATE_PREVIEW_VERSION,
    input.workspaceId,
    themeEnc,
    String(exp),
    sig,
  ].join(SEP);
}

/** Verify cookie; fail closed on tamper/expiry/unknown theme. */
export function verifyOwnerTemplatePreviewCookie(
  value: string | null | undefined,
  opts?: { nowMs?: number },
): OwnerTemplatePreviewPayload | null {
  if (!value?.trim()) return null;
  const parts = value.split(SEP);
  if (parts.length !== 5) return null;
  const [version, workspaceId, themeEnc, expRaw, sig] = parts;
  if (version !== OWNER_TEMPLATE_PREVIEW_VERSION) return null;
  if (!workspaceId || !WORKSPACE_ID_RE.test(workspaceId)) return null;
  if (!themeEnc || !expRaw || !sig) return null;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= 0) return null;
  const nowSec = Math.floor((opts?.nowMs ?? Date.now()) / 1000);
  if (exp < nowSec) return null;

  let themeId: string;
  try {
    themeId = Buffer.from(themeEnc, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const theme = getThemeById(themeId);
  if (!theme) return null;
  const parsed = parseThemeId(theme.id);
  if (!parsed) return null;
  const template = getTemplate(parsed.templateId);
  if (!template) return null;

  const expected = signPayload(workspaceId, theme.id, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return {
    workspaceId,
    themeId: theme.id,
    templateId: template.id,
    templateLabel: template.label,
    themeLabel: theme.label,
    expiresAtUnix: exp,
  };
}

/**
 * Resolve preview theme for a hostname-bound workspace.
 * Cookie workspaceId must match — otherwise ignore (cross-tenant fail closed).
 */
export function resolveOwnerTemplatePreviewThemeIdForWorkspace(
  cookieValue: string | null | undefined,
  workspaceId: string,
  opts?: { nowMs?: number },
): OwnerTemplatePreviewPayload | null {
  const payload = verifyOwnerTemplatePreviewCookie(cookieValue, opts);
  if (!payload) return null;
  if (payload.workspaceId !== workspaceId) return null;
  return payload;
}

export function ownerTemplatePreviewCookieOptions(maxAgeSec?: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSec ?? OWNER_TEMPLATE_PREVIEW_TTL_SEC,
  };
}

export async function readOwnerTemplatePreviewCookieRaw(): Promise<string | null> {
  try {
    const jar = await cookies();
    return jar.get(OWNER_TEMPLATE_PREVIEW_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/** Enrich label from catalog template definition when possible. */
export function previewDisplayLabel(payload: OwnerTemplatePreviewPayload): string {
  if (payload.templateId === "agent-signature") {
    return `Agent Signature · ${payload.themeLabel}`;
  }
  if (payload.templateId === "default-signature") {
    return `Default · ${payload.themeLabel}`;
  }
  return payload.templateLabel;
}
