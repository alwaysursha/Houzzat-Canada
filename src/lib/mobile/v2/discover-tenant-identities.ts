/**
 * Phase 3 — password-gated tenant identity discovery for HouzzatPRO mobile.
 *
 * Returns only workspaces where the supplied email+password authenticate a
 * tenant-bound User (workspaceId NOT NULL) with an ACTIVE staff membership.
 *
 * Never includes NULL-workspace / PlatformOperator identities.
 * Never authenticates globally then attaches to another workspace.
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";

/** Constant-time pad when no candidate hashes exist (limits email existence timing). */
const TIMING_PAD_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

const STAFF_ROLES = ["OWNER", "ADMIN", "AGENT"] as const;

export type DiscoveredTenantIdentity = {
  workspaceId: string;
  userId: string;
  role: (typeof STAFF_ROLES)[number];
  displayName: string;
  slug: string;
};

export type DiscoverTenantIdentitiesResult =
  | { ok: true; matches: DiscoveredTenantIdentity[] }
  | { ok: false; code: "INVALID_CREDENTIALS" };

type DiscoverDeps = {
  findCandidates: (email: string) => Promise<
    Array<{
      id: string;
      password: string | null;
      workspaceId: string | null;
      workspaceMemberships: Array<{
        workspaceId: string;
        role: string;
        workspace: {
          id: string;
          slug: string;
          name: string;
          status: string;
          branding: { displayName: string | null } | null;
        };
      }>;
    }>
  >;
  comparePassword: (plain: string, hash: string) => Promise<boolean>;
};

async function defaultFindCandidates(email: string) {
  return prisma.user.findMany({
    where: {
      email,
      workspaceId: { not: null },
      password: { not: null },
      disabledAt: null,
    },
    select: {
      id: true,
      password: true,
      workspaceId: true,
      workspaceMemberships: {
        where: {
          status: "ACTIVE",
          role: { in: [...STAFF_ROLES] },
        },
        select: {
          workspaceId: true,
          role: true,
          workspace: {
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
              branding: { select: { displayName: true } },
            },
          },
        },
      },
    },
    take: 25,
  });
}

/**
 * Pure-ish discover core (injectable for selftests).
 * Password must match; membership must be ACTIVE staff on the user's home workspace.
 */
export async function discoverTenantIdentitiesForCredentials(
  input: { email: string; password: string },
  deps?: Partial<DiscoverDeps>,
): Promise<DiscoverTenantIdentitiesResult> {
  const email = normalizeIdentityEmail(input.email);
  const password = input.password;
  if (!email || !password) {
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  const findCandidates = deps?.findCandidates ?? defaultFindCandidates;
  const comparePassword =
    deps?.comparePassword ??
    ((plain, hash) => bcrypt.compare(plain, hash));

  const candidates = await findCandidates(email);

  // Always burn at least one bcrypt compare (timing pad when empty).
  if (candidates.length === 0) {
    await comparePassword(password, TIMING_PAD_HASH).catch(() => false);
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  const matches: DiscoveredTenantIdentity[] = [];

  for (const candidate of candidates) {
    const workspaceId = candidate.workspaceId;
    if (!workspaceId || !candidate.password) continue;

    const homeMembership = candidate.workspaceMemberships.find(
      (m) =>
        m.workspaceId === workspaceId &&
        m.workspace.status === "ACTIVE" &&
        (STAFF_ROLES as readonly string[]).includes(m.role),
    );
    if (!homeMembership) {
      // Still compare to avoid short-circuit timing on membership-less rows.
      await comparePassword(password, candidate.password).catch(() => false);
      continue;
    }

    const valid = await comparePassword(password, candidate.password);
    if (!valid) continue;

    matches.push({
      workspaceId,
      userId: candidate.id,
      role: homeMembership.role as DiscoveredTenantIdentity["role"],
      displayName:
        homeMembership.workspace.branding?.displayName?.trim() ||
        homeMembership.workspace.name,
      slug: homeMembership.workspace.slug,
    });
  }

  if (matches.length === 0) {
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  // Stable order for deterministic multi-select UI.
  matches.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { ok: true, matches };
}
