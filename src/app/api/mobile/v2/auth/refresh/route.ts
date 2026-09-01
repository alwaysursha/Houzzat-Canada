/**
 * Stage 4.1 — POST /api/mobile/v2/auth/refresh
 *
 * Rotates access token using a valid, non-revoked refresh token.
 * Also rotates + slides the refresh session so CRM agents can stay signed in
 * indefinitely as long as the app refreshes at least once within the TTL window.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  verifyMobileToken,
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  createMobileRefreshToken,
} from "@/lib/mobile/v2/tokens";
import {
  validateMobileSession,
  storeMobileSession,
  revokeMobileSession,
} from "@/lib/mobile/v2/session-store";

export const runtime = "nodejs";

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
  activeWorkspaceId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = refreshSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Missing refreshToken" },
        { status: 400 },
      );
    }

    const { refreshToken, activeWorkspaceId } = parsed.data;

    // 1. Verify token signature and expiration
    const verifyResult = verifyMobileToken(refreshToken);
    if (!verifyResult.ok || verifyResult.payload.type !== "mobile_refresh") {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", message: "Invalid or expired refresh token" },
        { status: 401 },
      );
    }

    const { sub: userId, email, jti } = verifyResult.payload;

    // 2. Validate session has not been revoked server-side
    const isValidSession = await validateMobileSession({
      userId,
      jti,
      refreshToken,
    });

    if (!isValidSession) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", message: "Session has been revoked or expired" },
        { status: 401 },
      );
    }

    // 3. Verify user is still active in database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, disabledAt: true },
    });

    if (!user || user.disabledAt) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", message: "User account is disabled" },
        { status: 401 },
      );
    }

    // 4. If an active workspace was requested, re-validate membership and grant workspace token
    let newAccessToken: { token: string; expiresAt: number };

    if (activeWorkspaceId) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: activeWorkspaceId,
            userId,
          },
        },
        include: {
          workspace: { select: { id: true, status: true } },
        },
      });

      if (!membership || membership.status !== "ACTIVE" || membership.workspace.status !== "ACTIVE") {
        // Fallback to platform token if workspace membership was revoked
        newAccessToken = createPlatformAccessToken({ id: userId, email });
      } else {
        newAccessToken = createWorkspaceAccessToken({
          userId,
          email,
          workspaceId: activeWorkspaceId,
          role: membership.role,
        });
      }
    } else {
      newAccessToken = createPlatformAccessToken({ id: userId, email });
    }

    // 5. Rotate + slide refresh session (WhatsApp-style keep-alive).
    const rotatedRefresh = createMobileRefreshToken({ id: userId, email });
    await revokeMobileSession({ userId, jti });
    await storeMobileSession({
      userId,
      jti: rotatedRefresh.jti,
      refreshToken: rotatedRefresh.token,
      expiresAt: new Date(rotatedRefresh.expiresAt),
    });

    return NextResponse.json({
      ok: true,
      data: {
        tokens: {
          accessToken: newAccessToken.token,
          expiresAt: newAccessToken.expiresAt,
          refreshToken: rotatedRefresh.token,
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
