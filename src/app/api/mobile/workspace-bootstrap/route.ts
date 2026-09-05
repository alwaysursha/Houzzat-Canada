import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { loadMobileBootstrapMemberships } from "@/lib/mobile/load-bootstrap-memberships";
import {
  findMembershipForHostname,
  resolveMobileWorkspaceBootstrapState,
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
  const currentHostMembership = hostname
    ? findMembershipForHostname(memberships, hostname)
    : null;
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
