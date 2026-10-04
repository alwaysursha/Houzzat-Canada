import { randomBytes } from "crypto";
import type { ActiveMode, Role } from "@prisma/client";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { safeInternalCallbackUrl } from "@/lib/auth/safe-callback-url";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import { isResendConfigured } from "@/lib/email/config";
import { renderVerifyEmail, renderWelcomeEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";
import {
  findTenantUserByEmail,
  normalizeIdentityEmail,
  parseTenantBoundTokenIdentifier,
  tenantBoundTokenIdentifier,
} from "@/lib/auth/workspace-identity";
import { resolveTrustedRequestOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

export const VERIFY_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Min gap between verification emails for the same address. */
export const VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;

export function isEmailSendConfigured() {
  return isResendConfigured();
}

export async function createEmailVerificationToken(
  workspaceId: string,
  email: string,
) {
  const normalized = normalizeIdentityEmail(email);
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
  const identifier = tenantBoundTokenIdentifier(
    "email-verify",
    workspaceId,
    normalized,
  );

  await prisma.verificationToken.deleteMany({
    where: { identifier },
  });

  await prisma.verificationToken.create({
    data: {
      identifier,
      token,
      expires,
    },
  });

  return { token, expires, email: normalized, workspaceId };
}

/**
 * Tenant-host verification context — mirrors existing request-tenancy origin resolution.
 * Prefer request tenancy (canonical custom domain / PLATFORM primary host).
 * Never invent workspace from email.
 */
export async function resolveEmailVerificationContext(request: Request): Promise<{
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

/**
 * Build verification URL for a specific tenant origin.
 * `origin` is required — do not silently fall back to global SITE_URL here.
 */
export function verificationLink(
  token: string,
  callbackUrl: string | undefined,
  origin: string,
) {
  const base = origin.trim();
  if (!base) {
    throw new Error("verificationLink requires a tenant origin");
  }
  const url = new URL("/auth/verify-email", base);
  url.searchParams.set("token", token);
  const safe = safeInternalCallbackUrl(callbackUrl, "/");
  if (safe !== "/") {
    url.searchParams.set("callbackUrl", safe);
  }
  return url.toString();
}

/**
 * Create token + send verification email.
 * Returns skipped when Resend is not configured.
 * Tenant-bound: Houzzat token cannot verify RE/MAX / Maria User.
 * `origin` must be the tenant's canonical public origin (not global SITE_URL).
 */
export const VERIFY_EMAIL_KIND = "verify_email";
export const VERIFY_EMAIL_NUDGE_KIND = "verify_email_nudge";

export async function sendEmailVerification(input: {
  email: string;
  name?: string | null;
  callbackUrl?: string;
  customerId?: string | null;
  workspaceId: string;
  /** Canonical tenant website origin (custom domain or PLATFORM primary). */
  origin: string;
  /**
   * `automatic_nudge` is the 24-hour fallback job only.
   * Manual / locked-product sends stay `manual` (default).
   */
  purpose?: "manual" | "automatic_nudge";
}): Promise<"sent" | "skipped" | "failed"> {
  const origin = input.origin.trim();
  if (!origin) {
    console.error("[verify-email] missing tenant origin", {
      workspaceId: input.workspaceId,
    });
    return "failed";
  }

  if (!isEmailSendConfigured()) {
    console.info("[verify-email:stub] RESEND_API_KEY missing", {
      email: input.email,
      workspaceId: input.workspaceId,
      origin,
    });
    return "skipped";
  }

  const { token, email } = await createEmailVerificationToken(
    input.workspaceId,
    input.email,
  );
  const link = verificationLink(token, input.callbackUrl, origin);
  const rendered = renderVerifyEmail({
    name: input.name,
    verifyUrl: link,
  });
  if (input.purpose === "automatic_nudge") {
    rendered.kind = VERIFY_EMAIL_NUDGE_KIND;
  }

  const user =
    input.customerId
      ? { id: input.customerId }
      : await findTenantUserByEmail(input.workspaceId, email);

  const result = await sendAndLogClientEmail({
    to: email,
    rendered,
    stream: "notify",
    customerId: user?.id,
    logToCrm: true,
  });

  return result.status === "sent"
    ? "sent"
    : result.status === "skipped"
      ? "skipped"
      : "failed";
}

export async function sendWelcomeEmail(input: {
  email: string;
  name?: string | null;
  customerId?: string | null;
}): Promise<"sent" | "skipped" | "failed"> {
  if (!isEmailSendConfigured()) return "skipped";

  const rendered = renderWelcomeEmail({ name: input.name });
  const result = await sendAndLogClientEmail({
    to: normalizeIdentityEmail(input.email),
    rendered,
    stream: "notify",
    customerId: input.customerId,
    logToCrm: true,
  });

  return result.status === "sent"
    ? "sent"
    : result.status === "skipped"
      ? "skipped"
      : "failed";
}

export type VerificationTokenPeekCode =
  | "missing"
  | "expired"
  | "invalid"
  | "disabled"
  | "staff";

export type VerificationTokenPeekResult =
  | {
      ok: true;
      userId: string;
      emailVerified: boolean;
    }
  | { ok: false; error: string; code: VerificationTokenPeekCode };

/** Read token owner/expiry without consuming or deleting the token. */
export async function peekEmailVerificationToken(
  token: string,
): Promise<VerificationTokenPeekResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "Missing verification token.", code: "missing" };
  }

  const row = await prisma.verificationToken.findUnique({
    where: { token: trimmed },
  });
  if (!row) {
    return {
      ok: false,
      error: "Verification link expired or invalid.",
      code: "invalid",
    };
  }
  if (row.expires.getTime() < Date.now()) {
    return {
      ok: false,
      error: "Verification link expired or invalid.",
      code: "expired",
    };
  }

  const parsed = parseTenantBoundTokenIdentifier("email-verify", row.identifier);
  if (!parsed) {
    return {
      ok: false,
      error: "Verification link expired or invalid.",
      code: "invalid",
    };
  }

  const user = await findTenantUserByEmail(parsed.workspaceId, parsed.email);
  if (!user) {
    return {
      ok: false,
      error: "Verification link expired or invalid.",
      code: "invalid",
    };
  }
  if (user.disabledAt) {
    return {
      ok: false,
      error: "This account has been disabled. Contact Houzzat support.",
      code: "disabled",
    };
  }
  if (user.role === "AGENT" || user.role === "ADMIN") {
    return {
      ok: false,
      error: "Use your team sign-in page for this account.",
      code: "staff",
    };
  }

  const verified = await prisma.user.findUnique({
    where: { id: user.id },
    select: { emailVerified: true },
  });

  return {
    ok: true,
    userId: user.id,
    emailVerified: Boolean(verified?.emailVerified),
  };
}

export async function consumeEmailVerificationToken(
  token: string,
): Promise<
  | {
      ok: true;
      user: {
        id: string;
        email: string;
        name: string | null;
        image: string | null;
        role: Role;
        isBuyer: boolean;
        isSeller: boolean;
        activeMode: ActiveMode;
        workspaceId: string | null;
      };
    }
  | { ok: false; error: string }
> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Missing verification token." };

  const row = await prisma.verificationToken.findUnique({
    where: { token: trimmed },
  });
  if (!row) {
    return {
      ok: false,
      error: "Verification link expired or invalid.",
    };
  }
  if (row.expires.getTime() < Date.now()) {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return { ok: false, error: "Verification link expired or invalid." };
  }

  const parsed = parseTenantBoundTokenIdentifier("email-verify", row.identifier);
  if (!parsed) {
    return { ok: false, error: "Verification link expired or invalid." };
  }

  const user = await findTenantUserByEmail(parsed.workspaceId, parsed.email);
  if (!user) {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return { ok: false, error: "Account not found for this link." };
  }

  if (user.disabledAt) {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return {
      ok: false,
      error: "This account has been disabled. Contact Houzzat support.",
    };
  }

  if (user.role === "AGENT" || user.role === "ADMIN") {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return {
      ok: false,
      error: "Use your team sign-in page for this account.",
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.deleteMany({
      where: {
        identifier: tenantBoundTokenIdentifier(
          "email-verify",
          parsed.workspaceId,
          parsed.email,
        ),
      },
    }),
  ]);

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      isBuyer: user.isBuyer,
      isSeller: user.isSeller,
      activeMode: user.activeMode,
      workspaceId: user.workspaceId,
    },
  };
}
