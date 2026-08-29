/**
 * Stage 3K.5.10 — one-time cross-host mobile workspace session handoff.
 * Uses existing VerificationToken storage (no new schema).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ActiveMode, Role, WorkspaceMemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import { isValidWorkspaceIdShape } from "@/lib/active-workspace";
import {
  HOUZZATPRO_MOBILE_HANDOFF_PATH,
  isPlatformMobileBootstrapHost,
} from "@/lib/mobile/platform-bootstrap";
import {
  isStaffWorkspaceMemberRole,
  resolveWorkspaceMemberMobileDestination,
  type MobileStaffPathDestination,
} from "@/lib/mobile/workspace-destination";
import { absoluteUrlForOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";

export const MOBILE_HANDOFF_PROVIDER_ID = "mobile-workspace-handoff";
export const MOBILE_HANDOFF_TTL_MS = 2 * 60 * 1000;
const IDENTIFIER_PREFIX = "mobile-handoff:";

export type MobileStaffDestination = MobileStaffPathDestination;

export type MobileHandoffIdentifier = {
  userId: string;
  workspaceId: string;
  targetHostname: string;
};

export type MobileWorkspaceHandoffRow = {
  code: string;
  handoffUrl: string;
  targetOrigin: string;
  targetHostname: string;
  workspaceId: string;
  destination: MobileStaffDestination;
  expiresAt: Date;
};

export function hashHandoffCode(rawCode: string): string {
  return createHash("sha256").update(rawCode, "utf8").digest("hex");
}

export function buildMobileHandoffIdentifier(input: MobileHandoffIdentifier): string {
  if (!isValidWorkspaceIdShape(input.userId)) {
    throw new Error("[mobile-handoff] invalid userId shape");
  }
  if (!isValidWorkspaceIdShape(input.workspaceId)) {
    throw new Error("[mobile-handoff] invalid workspaceId shape");
  }
  const host = normalizeWorkspaceHostname(input.targetHostname);
  if (!host.ok) throw new Error("[mobile-handoff] invalid target hostname");
  return `${IDENTIFIER_PREFIX}${input.userId}:${input.workspaceId}:${host.hostname}`;
}

export function parseMobileHandoffIdentifier(
  identifier: string,
): MobileHandoffIdentifier | null {
  if (!identifier.startsWith(IDENTIFIER_PREFIX)) return null;
  const rest = identifier.slice(IDENTIFIER_PREFIX.length);
  const parts = rest.split(":");
  if (parts.length < 3) return null;
  const userId = parts[0] ?? "";
  const workspaceId = parts[1] ?? "";
  const targetHostname = parts.slice(2).join(":");
  if (!isValidWorkspaceIdShape(userId) || !isValidWorkspaceIdShape(workspaceId)) {
    return null;
  }
  const host = normalizeWorkspaceHostname(targetHostname);
  if (!host.ok) return null;
  return { userId, workspaceId, targetHostname: host.hostname };
}

export async function resolveMobileWorkspaceCanonicalHost(
  workspaceId: string,
  workspaceSlug: string,
): Promise<string | null> {
  const fallback = `${workspaceSlug}.houzzatpro.com`;
  try {
    const origin = await resolveCanonicalPublicOrigin(workspaceId, fallback);
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

export async function createMobileWorkspaceHandoff(input: {
  userId: string;
  workspaceId: string;
  workspaceRole: WorkspaceMemberRole;
  requestHostname: string;
}): Promise<
  | { ok: true; handoff: MobileWorkspaceHandoffRow }
  | { ok: false; error: string; status: number }
> {
  if (!isPlatformMobileBootstrapHost(input.requestHostname)) {
    return {
      ok: false,
      error: "Handoff may only be issued from the HouzzatPRO platform bootstrap host",
      status: 403,
    };
  }
  if (!isStaffWorkspaceMemberRole(input.workspaceRole)) {
    return { ok: false, error: "Workspace role cannot access staff mobile CRM", status: 403 };
  }

  const member = await prisma.workspaceMember.findFirst({
    where: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { role: true, workspace: { select: { slug: true } } },
  });
  if (!member || member.role !== input.workspaceRole) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  const targetHostname = await resolveMobileWorkspaceCanonicalHost(
    input.workspaceId,
    member.workspace.slug,
  );
  if (!targetHostname) {
    return { ok: false, error: "Workspace hostname unavailable", status: 422 };
  }

  const rawCode = randomBytes(32).toString("base64url");
  const token = hashHandoffCode(rawCode);
  const identifier = buildMobileHandoffIdentifier({
    userId: input.userId,
    workspaceId: input.workspaceId,
    targetHostname,
  });
  const expiresAt = new Date(Date.now() + MOBILE_HANDOFF_TTL_MS);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({ data: { identifier, token, expires: expiresAt } });

  const targetOrigin = `https://${targetHostname}`;
  const handoffPath = `${HOUZZATPRO_MOBILE_HANDOFF_PATH}?code=${encodeURIComponent(rawCode)}`;
  const handoffUrl = absoluteUrlForOrigin(targetOrigin, handoffPath);
  if (!handoffUrl) return { ok: false, error: "Invalid handoff URL", status: 500 };

  return {
    ok: true,
    handoff: {
      code: rawCode,
      handoffUrl,
      targetOrigin,
      targetHostname,
      workspaceId: input.workspaceId,
      destination: resolveWorkspaceMemberMobileDestination(member.role),
      expiresAt,
    },
  };
}

type HandoffUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: Role;
  isBuyer: boolean;
  isSeller: boolean;
  activeMode: ActiveMode;
};

type HandoffLookupOk = {
  ok: true;
  token: string;
  parsed: MobileHandoffIdentifier;
  memberRole: WorkspaceMemberRole;
  destination: MobileStaffDestination;
  user: HandoffUser;
};

/**
 * Read-only handoff validation (does not consume the one-time code).
 * Destination is always from ACTIVE WorkspaceMember.role for the bound workspace.
 */
export async function peekMobileWorkspaceHandoff(input: {
  rawCode: string;
  requestHostname: string;
}): Promise<
  | {
      ok: true;
      workspaceId: string;
      destination: MobileStaffDestination;
      workspaceRole: WorkspaceMemberRole;
    }
  | { ok: false; error: string }
> {
  const looked = await lookupMobileWorkspaceHandoff(input);
  if (!looked.ok) return looked;
  return {
    ok: true,
    workspaceId: looked.parsed.workspaceId,
    destination: looked.destination,
    workspaceRole: looked.memberRole,
  };
}

async function lookupMobileWorkspaceHandoff(input: {
  rawCode: string;
  requestHostname: string;
}): Promise<HandoffLookupOk | { ok: false; error: string }> {
  const trimmed = input.rawCode.trim();
  if (!trimmed) return { ok: false, error: "Missing handoff code" };

  const requestHost = normalizeWorkspaceHostname(input.requestHostname);
  if (!requestHost.ok) return { ok: false, error: "Invalid request host" };

  const token = hashHandoffCode(trimmed);
  const row = await prisma.verificationToken.findUnique({ where: { token } });
  if (!row) {
    console.error("[mobile-handoff-lookup] token not found in database:", {
      tokenPrefix: token.slice(0, 8),
      requestHostname: requestHost.hostname,
    });
    return { ok: false, error: "Handoff code not found or already consumed" };
  }
  if (row.expires.getTime() < Date.now()) {
    console.error("[mobile-handoff-lookup] token expired:", {
      expiresAt: row.expires.toISOString(),
      now: new Date().toISOString(),
      requestHostname: requestHost.hostname,
    });
    return { ok: false, error: "Handoff expired" };
  }

  const parsed = parseMobileHandoffIdentifier(row.identifier);
  if (!parsed) {
    console.error("[mobile-handoff-lookup] invalid identifier shape:", row.identifier);
    return { ok: false, error: "Invalid handoff record" };
  }
  if (parsed.targetHostname !== requestHost.hostname) {
    console.error("[mobile-handoff-lookup] hostname mismatch:", {
      targetHostname: parsed.targetHostname,
      requestHostname: requestHost.hostname,
    });
    return { ok: false, error: `Handoff host mismatch (${parsed.targetHostname} !== ${requestHost.hostname})` };
  }

  const member = await prisma.workspaceMember.findFirst({
    where: {
      userId: parsed.userId,
      workspaceId: parsed.workspaceId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { role: true },
  });
  if (!member || !isStaffWorkspaceMemberRole(member.role)) {
    return { ok: false, error: "Forbidden" };
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      isBuyer: true,
      isSeller: true,
      activeMode: true,
      disabledAt: true,
    },
  });
  if (!user || user.disabledAt) {
    return { ok: false, error: "Account unavailable" };
  }

  return {
    ok: true,
    token,
    parsed,
    memberRole: member.role,
    destination: resolveWorkspaceMemberMobileDestination(member.role),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      isBuyer: user.isBuyer,
      isSeller: user.isSeller,
      activeMode: user.activeMode,
    },
  };
}

/** True when Auth.js credentials signIn returned an error URL (redirect:false). */
export function isMobileHandoffSignInErrorResult(result: unknown): boolean {
  if (typeof result !== "string" || !result) return true;
  try {
    const url = new URL(result, "https://houzzat.invalid");
    return url.searchParams.has("error");
  } catch {
    return true;
  }
}

export async function consumeMobileWorkspaceHandoff(input: {
  rawCode: string;
  requestHostname: string;
}): Promise<
  | {
      ok: true;
      user: HandoffUser;
      workspaceId: string;
      destination: MobileStaffDestination;
    }
  | { ok: false; error: string }
> {
  const looked = await lookupMobileWorkspaceHandoff({
    ...input,
  });
  if (!looked.ok) return looked;

  return {
    ok: true,
    user: looked.user,
    workspaceId: looked.parsed.workspaceId,
    destination: looked.destination,
  };
}

export function handoffCodesEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
