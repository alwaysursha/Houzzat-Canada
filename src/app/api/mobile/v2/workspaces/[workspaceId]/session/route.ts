/**
 * Stage 4.1 — POST /api/mobile/v2/workspaces/[workspaceId]/session
 *
 * Activates a tenant workspace session for the authenticated mobile user.
 * Validates ACTIVE membership and derives authority strictly from WorkspaceMember.role.
 * Returns a short-lived workspace access token bound to userId + workspaceId + role.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";
import { createWorkspaceAccessToken } from "@/lib/mobile/v2/tokens";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const authResult = authenticateMobileRequest(request);
    if (!authResult.ok) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", message: authResult.error },
        { status: authResult.status },
      );
    }

    const { workspaceId } = await context.params;
    if (!workspaceId) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Missing workspaceId" },
        { status: 400 },
      );
    }

    const { sub: userId, email } = authResult.payload;

    // Query server-authoritative ACTIVE membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            branding: {
              select: {
                displayName: true,
                primaryColor: true,
                logoUrl: true,
              },
            },
          },
        },
      },
    });

    if (!membership || membership.status !== "ACTIVE" || membership.workspace.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, code: "WORKSPACE_FORBIDDEN", message: "User is not an active member of this workspace" },
        { status: 403 },
      );
    }

    // Derive authority strictly from WorkspaceMember.role (never User.role)
    const workspaceToken = createWorkspaceAccessToken({
      userId,
      email,
      workspaceId: membership.workspaceId,
      role: membership.role,
    });

    const publicOrigin = await resolveCanonicalPublicOrigin(
      membership.workspaceId,
      "houzzat.com",
    );

    return NextResponse.json({
      ok: true,
      data: {
        workspace: {
          id: membership.workspace.id,
          slug: membership.workspace.slug,
          displayName: membership.workspace.branding?.displayName || membership.workspace.name,
          publicOrigin: publicOrigin.replace(/\/$/, ""),
          brand: {
            primaryColor: membership.workspace.branding?.primaryColor || null,
            logoUrl: membership.workspace.branding?.logoUrl || null,
          },
        },
        membership: {
          id: membership.id,
          workspaceId: membership.workspaceId,
          userId: membership.userId,
          role: membership.role,
          status: membership.status,
        },
        tokens: {
          accessToken: workspaceToken.token,
          expiresAt: workspaceToken.expiresAt,
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message: msg },
      { status: 500 },
    );
  }
}
