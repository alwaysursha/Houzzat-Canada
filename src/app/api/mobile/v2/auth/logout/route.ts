/**
 * Stage 4.1 — POST /api/mobile/v2/auth/logout
 *
 * Server-side revocation of mobile sessions.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";
import { revokeMobileSession } from "@/lib/mobile/v2/session-store";

export const runtime = "nodejs";

const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const authResult = authenticateMobileRequest(request);
    if (!authResult.ok) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", message: authResult.error },
        { status: authResult.status },
      );
    }

    const { sub: userId, jti } = authResult.payload;
    const body = await request.json().catch(() => ({}));
    const parsed = logoutSchema.safeParse(body);

    // Revoke the current mobile session or all user sessions
    await revokeMobileSession({
      userId,
      jti: jti || undefined,
    });

    return NextResponse.json({
      ok: true,
      data: { message: "Successfully logged out" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message: msg },
      { status: 500 },
    );
  }
}
