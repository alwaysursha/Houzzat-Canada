/**
 * Stage 5.11 — POST /api/mobile/v2/push/unregister
 *
 * Removes this device token only when it still belongs to the authenticated user.
 * Protects account-switch races (do not delete a rebound token for user B).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().trim().min(16).max(4096),
});

export async function POST(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid body" },
        { status: 400 },
      );
    }

    const keys = Object.keys(json as Record<string, unknown>);
    const allowed = new Set(["token"]);
    if (keys.some((k) => !allowed.has(k))) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Unknown fields",
        },
        { status: 400 },
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid token" },
        { status: 400 },
      );
    }

    const result = await prisma.pushDevice.deleteMany({
      where: {
        token: parsed.data.token,
        userId: access.userId,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        removed: result.count > 0,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
