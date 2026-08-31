/**
 * Stage 4.1 — POST /api/mobile/v2/auth/login
 *
 * Verifies email/password against existing User credentials.
 * Issues Platform Access Token + Revocable Refresh Token.
 * ZERO workspace authority granted at this step.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createPlatformAccessToken,
  createMobileRefreshToken,
} from "@/lib/mobile/v2/tokens";
import { storeMobileSession } from "@/lib/mobile/v2/session-store";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email().min(3).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid email or password format" },
        { status: 400 },
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        password: true,
        disabledAt: true,
      },
    });

    if (!user || !user.password || user.disabledAt) {
      return NextResponse.json(
        { ok: false, code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
        { status: 401 },
      );
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return NextResponse.json(
        { ok: false, code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
        { status: 401 },
      );
    }

    // 1. Create platform access token (15m)
    const platformToken = createPlatformAccessToken({ id: user.id, email: user.email });

    // 2. Create revocable refresh token (30d)
    const refreshToken = createMobileRefreshToken({ id: user.id, email: user.email });

    // 3. Store session hash in database for server-side revocation tracking
    await storeMobileSession({
      userId: user.id,
      jti: refreshToken.jti,
      refreshToken: refreshToken.token,
      expiresAt: new Date(refreshToken.expiresAt),
    });

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.image,
        },
        tokens: {
          accessToken: platformToken.token,
          refreshToken: refreshToken.token,
          expiresAt: platformToken.expiresAt,
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
