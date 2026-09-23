import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset-email";
import { isResendConfigured } from "@/lib/email/config";
import { prisma } from "@/lib/prisma";
import { resolveTrustedRequestOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import {
  findTenantUserByEmail,
  normalizeIdentityEmail,
  tenantBoundTokenIdentifier,
  parseTenantBoundTokenIdentifier,
} from "@/lib/auth/workspace-identity";
import { sanitizeWorkspaceHintId } from "@/lib/platform/activation/onboarding-pro-auth";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
export const PASSWORD_RESET_MIN_LENGTH = 8;

export function passwordResetIdentifier(workspaceId: string, email: string) {
  return tenantBoundTokenIdentifier("password-reset", workspaceId, email);
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isEmailSendConfigured() {
  return isResendConfigured();
}

export async function resolvePasswordResetContext(request: Request): Promise<{
  origin: string;
  siteName: string;
  workspaceId: string | null;
}> {
  const tenancy = await resolveRequestTenancy(request);
  if (tenancy.ok) {
    return {
      origin: tenancy.origin,
      siteName: tenancy.brand.displayName || SITE_NAME,
      workspaceId: tenancy.workspaceId,
    };
  }

  const trusted = resolveTrustedRequestOrigin(request);
  if (trusted.ok) {
    return { origin: trusted.origin, siteName: SITE_NAME, workspaceId: null };
  }

  return { origin: SITE_URL, siteName: SITE_NAME, workspaceId: null };
}

export function passwordResetLink(token: string, origin: string) {
  const url = new URL("/auth/reset-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function createPasswordResetToken(
  workspaceId: string,
  email: string,
) {
  const normalized = normalizeIdentityEmail(email);
  const raw = randomBytes(32).toString("hex");
  const token = hashPasswordResetToken(raw);
  const identifier = passwordResetIdentifier(workspaceId, normalized);
  const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token, expires },
  });

  return { raw, expires, email: normalized, workspaceId };
}

/**
 * Create a reset token and email it when the account can use a password.
 * Always opaque to the caller — missing/disabled/OAuth-only accounts skip send.
 * Tenant-scoped: only the User in THIS workspace is affected.
 */
export async function requestPasswordReset(input: {
  email: string;
  origin: string;
  siteName?: string;
  workspaceId: string;
}): Promise<"sent" | "skipped" | "failed"> {
  const normalized = normalizeIdentityEmail(input.email);
  const user = await findTenantUserByEmail(input.workspaceId, normalized);

  if (!user?.password || user.disabledAt) {
    return "skipped";
  }

  if (!isEmailSendConfigured()) {
    const { raw } = await createPasswordResetToken(
      input.workspaceId,
      normalized,
    );
    const link = passwordResetLink(raw, input.origin);
    console.info("[password-reset:stub] RESEND_API_KEY missing", {
      email: normalized,
      workspaceId: input.workspaceId,
      resetUrl: link,
    });
    return "skipped";
  }

  const { raw } = await createPasswordResetToken(input.workspaceId, normalized);
  const link = passwordResetLink(raw, input.origin);
  return sendPasswordResetEmail({
    email: user.email,
    name: user.name,
    resetUrl: link,
    customerId: user.id,
    siteName: input.siteName,
  });
}

/**
 * Platform Pro host: resolve eligible tenant Users for reset without guessing.
 * - 0 matches → skip
 * - 1 match → that workspace
 * - N matches + workspaceHint matching one → that workspace
 * - N matches without valid hint → skip (do not pick arbitrarily)
 * Never includes NULL-workspace / PlatformOperator identities.
 */
export async function resolvePlatformTenantPasswordResetTargets(input: {
  email: string;
  workspaceHint?: string | null;
}): Promise<Array<{ workspaceId: string; email: string }>> {
  const normalized = normalizeIdentityEmail(input.email);
  const hint = sanitizeWorkspaceHintId(input.workspaceHint);
  const candidates = await prisma.user.findMany({
    where: {
      email: normalized,
      workspaceId: { not: null },
      password: { not: null },
      disabledAt: null,
    },
    select: {
      id: true,
      email: true,
      workspaceId: true,
      workspaceMemberships: {
        where: {
          status: "ACTIVE",
          role: { in: ["OWNER", "ADMIN", "AGENT"] },
          workspace: { status: { in: ["ACTIVE", "TRIAL"] } },
        },
        select: { workspaceId: true },
        take: 5,
      },
    },
    take: 25,
  });

  const eligible: Array<{ workspaceId: string; email: string }> = [];
  for (const row of candidates) {
    if (!row.workspaceId) continue;
    const home = row.workspaceMemberships.some(
      (m) => m.workspaceId === row.workspaceId,
    );
    if (!home) continue;
    eligible.push({ workspaceId: row.workspaceId, email: row.email });
  }

  if (eligible.length <= 1) return eligible;
  if (!hint) return [];
  return eligible.filter((row) => row.workspaceId === hint);
}

export type PasswordResetPeekResult =
  | { ok: true }
  | { ok: false; error: string };

export async function peekPasswordResetToken(
  token: string,
): Promise<PasswordResetPeekResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "This reset link is missing." };
  }

  const row = await prisma.verificationToken.findUnique({
    where: { token: hashPasswordResetToken(trimmed) },
  });
  if (!row || !parseTenantBoundTokenIdentifier("password-reset", row.identifier)) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  if (row.expires.getTime() < Date.now()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  return { ok: true };
}

export async function consumePasswordResetToken(
  token: string,
  newPassword: string,
): Promise<
  | { ok: true; email: string; workspaceId: string }
  | { ok: false; error: string }
> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "This reset link is missing." };
  }
  if (newPassword.length < PASSWORD_RESET_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_RESET_MIN_LENGTH} characters.`,
    };
  }
  if (newPassword.length > 128) {
    return { ok: false, error: "Password is too long." };
  }

  const hashedToken = hashPasswordResetToken(trimmed);
  const row = await prisma.verificationToken.findUnique({
    where: { token: hashedToken },
  });
  const parsed = row
    ? parseTenantBoundTokenIdentifier("password-reset", row.identifier)
    : null;
  if (!row || !parsed) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  if (row.expires.getTime() < Date.now()) {
    await prisma.verificationToken.delete({ where: { token: hashedToken } }).catch(
      () => undefined,
    );
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const user = await findTenantUserByEmail(parsed.workspaceId, parsed.email);
  if (!user) {
    await prisma.verificationToken.delete({ where: { token: hashedToken } }).catch(
      () => undefined,
    );
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  if (user.disabledAt) {
    await prisma.verificationToken.delete({ where: { token: hashedToken } }).catch(
      () => undefined,
    );
    return {
      ok: false,
      error: "This account has been disabled. Contact support.",
    };
  }

  const password = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password },
    }),
    prisma.verificationToken.deleteMany({
      where: {
        identifier: passwordResetIdentifier(parsed.workspaceId, parsed.email),
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return {
    ok: true,
    email: user.email,
    workspaceId: parsed.workspaceId,
  };
}
