import { NextResponse } from "next/server";
import { z } from "zod";
import {
  activeWorkspaceCookieOptions,
  ACTIVE_WORKSPACE_COOKIE,
  isTrustedStaffMutationOrigin,
  isValidWorkspaceIdShape,
  readActiveWorkspaceIdFromCookies,
  signActiveWorkspaceId,
} from "@/lib/active-workspace";
import { requireAgentUser } from "@/lib/agent";
import { SITE_URL } from "@/lib/constants";
import { listActiveWorkspaceMemberships } from "@/lib/workspace-context";

export const runtime = "nodejs";

/** List ACTIVE workspace memberships for the signed-in staff user. */
export async function GET() {
  const user = await requireAgentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await listActiveWorkspaceMemberships(user.id);
  const activeWorkspaceId = await readActiveWorkspaceIdFromCookies();
  const requiresSelection =
    memberships.length > 1 &&
    !(
      activeWorkspaceId &&
      memberships.some(
        (m) =>
          m.workspaceId === activeWorkspaceId &&
          m.workspace.status === "ACTIVE",
      )
    );

  return NextResponse.json({
    activeWorkspaceId,
    requiresSelection,
    memberships: memberships.map((m) => ({
      workspaceId: m.workspaceId,
      role: m.role,
      name: m.workspace.name,
      slug: m.workspace.slug,
      status: m.workspace.status,
      brokerageAffiliation: m.workspace.brokerageAffiliation,
    })),
  });
}

const selectSchema = z.object({
  workspaceId: z
    .string()
    .min(1)
    .refine(isValidWorkspaceIdShape, "Invalid workspaceId"),
});

/** Set server-trusted active Workspace (signed httpOnly cookie). */
export async function POST(request: Request) {
  const user = await requireAgentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTrustedStaffMutationOrigin(request, SITE_URL)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = selectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const memberships = await listActiveWorkspaceMemberships(user.id);
  const allowed = memberships.find(
    (m) =>
      m.workspaceId === parsed.data.workspaceId &&
      m.workspace.status === "ACTIVE",
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const res = NextResponse.json({
    ok: true,
    workspaceId: allowed.workspaceId,
    workspaceName: allowed.workspace.name,
  });
  res.cookies.set(
    ACTIVE_WORKSPACE_COOKIE,
    signActiveWorkspaceId(allowed.workspaceId),
    activeWorkspaceCookieOptions(),
  );
  return res;
}

/** Clear active Workspace selection (forces chooser for multi-membership users). */
export async function DELETE(request: Request) {
  const user = await requireAgentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTrustedStaffMutationOrigin(request, SITE_URL)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", {
    ...activeWorkspaceCookieOptions(),
    maxAge: 0,
  });
  return res;
}
