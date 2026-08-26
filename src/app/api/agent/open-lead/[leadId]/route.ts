import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { openLeadProfileHref } from "@/lib/agent/lead-profile-query";
import {
  ACTIVE_WORKSPACE_COOKIE,
  activeWorkspaceCookieOptions,
  isTrustedStaffMutationOriginForRequest,
  readActiveWorkspaceIdFromCookies,
  signActiveWorkspaceId,
} from "@/lib/active-workspace";
import { SITE_URL } from "@/lib/constants";
import { resolveOpenLeadHandoff } from "@/lib/open-lead-handoff";
import { prisma } from "@/lib/prisma";
import { isAgentRole } from "@/lib/roles";

function deskRedirect(leadId: string) {
  return NextResponse.redirect(
    new URL(openLeadProfileHref(leadId), SITE_URL),
    303,
  );
}

function withWorkspaceCookie(response: NextResponse, workspaceId: string) {
  response.cookies.set(
    ACTIVE_WORKSPACE_COOKIE,
    signActiveWorkspaceId(workspaceId),
    activeWorkspaceCookieOptions(),
  );
  return response;
}

async function requireAgentUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!user || user.disabledAt || !isAgentRole(user.role)) return null;
  return user.id;
}

/**
 * Same-workspace / implied-context handoff (cookie write + desk redirect).
 * Rejects true cross-workspace switches — those require POST after confirm UI.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  const userId = await requireAgentUserId();
  if (!userId) {
    const { leadId } = await context.params;
    const signIn = new URL("/pro/sign-in", SITE_URL);
    signIn.searchParams.set(
      "callbackUrl",
      `/agent/open-lead/${encodeURIComponent(leadId)}`,
    );
    return NextResponse.redirect(signIn, 303);
  }

  const { leadId } = await context.params;
  const cookieWorkspaceId = await readActiveWorkspaceIdFromCookies();
  const handoff = await resolveOpenLeadHandoff({
    userId,
    leadId,
    cookieWorkspaceId,
  });
  if (!handoff.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (handoff.needsConfirm) {
    // Do not silently switch — send back to confirmation page.
    return NextResponse.redirect(
      new URL(`/agent/open-lead/${encodeURIComponent(handoff.leadId)}`, SITE_URL),
      303,
    );
  }

  if (handoff.cookieAlreadyCorrect) {
    return deskRedirect(handoff.leadId);
  }

  return withWorkspaceCookie(deskRedirect(handoff.leadId), handoff.workspaceId);
}

/**
 * Stage 3I.1 — confirm cross-workspace lead handoff (POST).
 * Sets signed active-workspace cookie after membership validation.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  if (!isTrustedStaffMutationOriginForRequest(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const userId = await requireAgentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leadId } = await context.params;
  const cookieWorkspaceId = await readActiveWorkspaceIdFromCookies();
  const handoff = await resolveOpenLeadHandoff({
    userId,
    leadId,
    cookieWorkspaceId,
  });
  if (!handoff.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return withWorkspaceCookie(deskRedirect(handoff.leadId), handoff.workspaceId);
}
