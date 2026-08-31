/**
 * Stage 4.1 — GET /api/mobile/v2/workspaces
 *
 * Returns strictly ACTIVE WorkspaceMember rows for the authenticated mobile user.
 * ZERO workspace access for non-members.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authResult = authenticateMobileRequest(request);
    if (!authResult.ok) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", message: authResult.error },
        { status: authResult.status },
      );
    }

    const { sub: userId } = authResult.payload;

    const memberships = await prisma.workspaceMember.findMany({
      where: {
        userId,
        status: "ACTIVE",
        workspace: {
          status: "ACTIVE",
        },
      },
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        role: true,
        status: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
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
      orderBy: { createdAt: "asc" },
    });

    const safeMemberships = memberships.map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      userId: m.userId,
      role: m.role,
      status: m.status,
      workspace: {
        id: m.workspace.id,
        slug: m.workspace.slug,
        displayName: m.workspace.branding?.displayName || m.workspace.name,
        brand: {
          primaryColor: m.workspace.branding?.primaryColor || null,
          logoUrl: m.workspace.branding?.logoUrl || null,
        },
      },
    }));

    return NextResponse.json({
      ok: true,
      data: {
        memberships: safeMemberships,
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
