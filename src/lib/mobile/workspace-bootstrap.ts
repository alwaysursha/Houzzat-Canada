/**
 * Stage 3K.5.10 — mobile workspace bootstrap state (pure + server helpers).
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import {
  isStaffWorkspaceMemberRole,
  resolveWorkspaceMemberMobileDestination,
} from "@/lib/mobile/workspace-destination";

export type MobileBootstrapMembership = {
  workspaceId: string;
  role: WorkspaceMemberRole;
  name: string;
  slug: string;
  displayName: string;
  primaryColor: string | null;
  canonicalHostname: string;
  canonicalOrigin: string;
};

export type MobileWorkspaceBootstrapState =
  | {
      kind: "platform_sign_in";
    }
  | {
      kind: "no_workspace";
    }
  | {
      kind: "select_workspace";
      memberships: MobileBootstrapMembership[];
    }
  | {
      kind: "handoff";
      membership: MobileBootstrapMembership;
    }
  | {
      kind: "tenant_destination";
      membership: MobileBootstrapMembership;
      destination: "/admin" | "/agent" | "/pro/for-staff";
    };

export function resolveMobileWorkspaceBootstrapState(input: {
  authenticated: boolean;
  requestHostname: string;
  memberships: MobileBootstrapMembership[];
  currentHostMembership: MobileBootstrapMembership | null;
}): MobileWorkspaceBootstrapState {
  if (!input.authenticated) return { kind: "platform_sign_in" };

  const staffMemberships = input.memberships.filter((m) =>
    isStaffWorkspaceMemberRole(m.role),
  );
  if (staffMemberships.length === 0) return { kind: "no_workspace" };

  if (
    !isPlatformMobileBootstrapHost(input.requestHostname) &&
    input.currentHostMembership &&
    isStaffWorkspaceMemberRole(input.currentHostMembership.role)
  ) {
    return {
      kind: "tenant_destination",
      membership: input.currentHostMembership,
      destination: resolveWorkspaceMemberMobileDestination(
        input.currentHostMembership.role,
      ),
    };
  }

  if (staffMemberships.length === 1) {
    const membership = staffMemberships[0]!;
    if (membership.canonicalHostname === input.requestHostname) {
      return {
        kind: "tenant_destination",
        membership,
        destination: resolveWorkspaceMemberMobileDestination(membership.role),
      };
    }
    return { kind: "handoff", membership };
  }

  return { kind: "select_workspace", memberships: staffMemberships };
}

export function findMembershipForHostname(
  memberships: MobileBootstrapMembership[],
  hostname: string,
): MobileBootstrapMembership | null {
  return memberships.find((m) => m.canonicalHostname === hostname) ?? null;
}
