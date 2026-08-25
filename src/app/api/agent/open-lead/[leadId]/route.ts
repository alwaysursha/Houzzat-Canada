import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { openLeadProfileHref } from "@/lib/agent/lead-profile-query";
import {
  ACTIVE_WORKSPACE_COOKIE,
  activeWorkspaceCookieOptions,
  isTrustedStaffMutationOrigin,
  signActiveWorkspaceId,
} from "@/lib/active-workspace";
import { SITE_URL } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { isAgentRole } from "@/lib/roles";

/**
 * Stage 3I.1 — confirm cross-workspace lead handoff (POST only).
 * Sets signed active-workspace cookie after membership validation.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  if (!isTrustedStaffMutationOrigin(request, SITE_URL)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leadId } = await context.params;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!user || user.disabledAt || !isAgentRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      workspaceId: true,
      workspace: { select: { status: true } },
    },
  });
  if (!lead?.workspaceId || lead.workspace?.status !== "ACTIVE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: lead.workspaceId,
      userId: user.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response = NextResponse.redirect(
    new URL(openLeadProfileHref(lead.id), SITE_URL),
    303,
  );
  response.cookies.set(
    ACTIVE_WORKSPACE_COOKIE,
    signActiveWorkspaceId(lead.workspaceId),
    activeWorkspaceCookieOptions(),
  );
  return response;
}
