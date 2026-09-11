import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isHouzzatVercelTestHost } from "@/lib/auth/pro-sign-in-routing";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { lookupActiveWorkspaceDomainRow } from "@/lib/tenancy/workspace-domain-probe";
import { loadMobileBootstrapMemberships } from "@/lib/mobile/load-bootstrap-memberships";
import {
  findMembershipForHostname,
  resolveMobileWorkspaceBootstrapState,
  resolveVercelTestAliasCurrentHostMembership,
} from "@/lib/mobile/workspace-bootstrap";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import {
  OWNER_ONBOARDING_AUTH_QUERY,
  sanitizeWorkspaceHintId,
} from "@/lib/platform/activation/onboarding-pro-auth";

export const runtime = "nodejs";

/** Authenticated mobile workspace bootstrap state (platform + tenant hosts). */
export async function GET(request: Request) {
  const session = await auth();
  const hostname = extractTrustedRequestHostname(request) ?? "";
  const url = new URL(request.url);
  const workspaceHint = sanitizeWorkspaceHintId(
    url.searchParams.get(OWNER_ONBOARDING_AUTH_QUERY.workspaceHint),
  );

  if (!session?.user?.id) {
    return NextResponse.json({
      authenticated: false,
      bootstrap: { kind: "platform_sign_in" },
      platformBootstrap: isPlatformMobileBootstrapHost(hostname),
    });
  }

  const memberships = await loadMobileBootstrapMemberships(session.user.id);
  const canonicalMatch = hostname
    ? findMembershipForHostname(memberships, hostname)
    : null;
  let aliasWorkspaceId: string | null = null;
  if (!canonicalMatch && isHouzzatVercelTestHost(hostname)) {
    const aliasRow = await lookupActiveWorkspaceDomainRow(prisma, hostname);
    if (
      aliasRow &&
      aliasRow.status === "ACTIVE" &&
      aliasRow.workspaceStatus === "ACTIVE"
    ) {
      aliasWorkspaceId = aliasRow.workspaceId;
    }
  }
  const currentHostMembership = resolveVercelTestAliasCurrentHostMembership({
    hostname,
    memberships,
    canonicalMatch,
    aliasWorkspaceId,
  });
  const bootstrap = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: hostname,
    memberships,
    currentHostMembership,
    workspaceHint,
  });

  return NextResponse.json({
    authenticated: true,
    platformBootstrap: isPlatformMobileBootstrapHost(hostname),
    bootstrap,
    memberships,
  });
}
