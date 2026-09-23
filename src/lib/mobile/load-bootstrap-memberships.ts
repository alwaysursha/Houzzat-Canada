/**
 * Stage 3K.5.10 — load server-validated mobile bootstrap memberships.
 */
import { prisma } from "@/lib/prisma";
import { resolveMobileWorkspaceCanonicalHost } from "@/lib/mobile/mobile-workspace-handoff";
import type { MobileBootstrapMembership } from "@/lib/mobile/workspace-bootstrap";
import { listActiveWorkspaceMemberships } from "@/lib/workspace-context";

export async function loadMobileBootstrapMemberships(
  userId: string,
): Promise<MobileBootstrapMembership[]> {
  const memberships = await listActiveWorkspaceMemberships(userId);
  if (memberships.length === 0) return [];

  const workspaceIds = memberships.map((m) => m.workspaceId);
  const brandingRows = await prisma.workspaceBranding.findMany({
    where: { workspaceId: { in: workspaceIds } },
    select: {
      workspaceId: true,
      displayName: true,
      primaryColor: true,
    },
  });
  const brandingByWorkspace = new Map(
    brandingRows.map((row) => [row.workspaceId, row]),
  );

  const resolved: MobileBootstrapMembership[] = [];
  for (const membership of memberships) {
    if (
      membership.workspace.status !== "ACTIVE" &&
      membership.workspace.status !== "TRIAL"
    ) {
      continue;
    }
    const hostname = await resolveMobileWorkspaceCanonicalHost(
      membership.workspaceId,
      membership.workspace.slug,
    );
    if (!hostname) continue;
    const branding = brandingByWorkspace.get(membership.workspaceId);
    resolved.push({
      workspaceId: membership.workspaceId,
      role: membership.role,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      displayName: branding?.displayName ?? membership.workspace.name,
      primaryColor: branding?.primaryColor ?? null,
      canonicalHostname: hostname,
      canonicalOrigin: `https://${hostname}`,
    });
  }
  return resolved;
}
