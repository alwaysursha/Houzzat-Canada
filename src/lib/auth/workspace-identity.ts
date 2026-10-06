/**
 * Phase 3 — strict workspace identity helpers.
 *
 * Tenant identity resolution:
 *   hostname → Workspace → User(workspaceId, email)
 *
 * NULL-workspace Users (platform operator, orphans, pre-split Omer) must NEVER
 * resolve on a tenant hostname for signup / credentials / reset / verify.
 */
import { prisma } from "@/lib/prisma";

export function normalizeIdentityEmail(email: string): string {
  return email.trim().toLowerCase();
}

const tenantAuthSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
  isBuyer: true,
  isSeller: true,
  activeMode: true,
  password: true,
  passwordCredentialKind: true,
  disabledAt: true,
  workspaceId: true,
} as const;

export type TenantAuthUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: import("@prisma/client").Role;
  isBuyer: boolean;
  isSeller: boolean;
  activeMode: import("@prisma/client").ActiveMode;
  password: string | null;
  passwordCredentialKind: import("@prisma/client").PasswordCredentialKind;
  disabledAt: Date | null;
  workspaceId: string | null;
};

/** Tenant-bound User lookup. Never returns NULL-workspace rows. */
export async function findTenantUserByEmail(
  workspaceId: string,
  email: string,
): Promise<TenantAuthUser | null> {
  const normalized = normalizeIdentityEmail(email);
  return prisma.user.findFirst({
    where: { workspaceId, email: normalized },
    select: tenantAuthSelect,
  });
}

/** Exists check for tenant signup (same workspace only). */
export async function findTenantUserIdByEmail(
  workspaceId: string,
  email: string,
): Promise<{ id: string; disabledAt: Date | null } | null> {
  const normalized = normalizeIdentityEmail(email);
  return prisma.user.findFirst({
    where: { workspaceId, email: normalized },
    select: { id: true, disabledAt: true },
  });
}

/** Platform / orphan NULL-workspace lookup. */
export async function findNullWorkspaceUserByEmail(
  email: string,
): Promise<TenantAuthUser | null> {
  const normalized = normalizeIdentityEmail(email);
  return prisma.user.findFirst({
    where: { workspaceId: null, email: normalized },
    select: tenantAuthSelect,
  });
}

/**
 * Password-reset / email-verify token identifier.
 * Tenant tokens are bound to workspaceId so Houzzat cannot affect RE/MAX.
 */
export function tenantBoundTokenIdentifier(
  kind: "password-reset" | "email-verify",
  workspaceId: string,
  email: string,
): string {
  const normalized = normalizeIdentityEmail(email);
  return `${kind}:ws:${workspaceId}:${normalized}`;
}

export function parseTenantBoundTokenIdentifier(
  kind: "password-reset" | "email-verify",
  identifier: string,
): { workspaceId: string; email: string } | null {
  const prefix = `${kind}:ws:`;
  if (!identifier.startsWith(prefix)) return null;
  const rest = identifier.slice(prefix.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const workspaceId = rest.slice(0, sep);
  const email = normalizeIdentityEmail(rest.slice(sep + 1));
  if (!workspaceId || !email) return null;
  return { workspaceId, email };
}

/** Legacy password-reset identifiers (pre-Phase-3). */
export const LEGACY_PASSWORD_RESET_PREFIX = "password-reset:";

export function isLegacyPasswordResetIdentifier(identifier: string): boolean {
  return (
    identifier.startsWith(LEGACY_PASSWORD_RESET_PREFIX) &&
    !identifier.startsWith("password-reset:ws:")
  );
}
