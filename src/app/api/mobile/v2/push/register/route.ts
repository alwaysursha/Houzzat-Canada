/**
 * Stage 5.11 — POST /api/mobile/v2/push/register
 *
 * Canonical PushDevice upsert (same model as /api/notifications/register).
 * Auth: Mobile v2 workspace token → authenticated userId (never from body).
 * Shell forced to houzzatpro for native HouzzatPRO app.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().trim().min(16).max(4096),
  platform: z.enum(["android", "ios", "web"]),
  shell: z.enum(["houzzat", "houzzatpro"]),
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
    const allowed = new Set(["token", "platform", "shell"]);
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
    if ("userId" in (json as object)) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "userId is not accepted",
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

    // Native HouzzatPRO must register as staff shell only.
    if (parsed.data.shell !== "houzzatpro") {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "shell must be houzzatpro",
        },
        { status: 400 },
      );
    }

    await prisma.pushDevice.upsert({
      where: { token: parsed.data.token },
      create: {
        userId: access.userId,
        token: parsed.data.token,
        platform: parsed.data.platform,
        shell: "houzzatpro",
      },
      update: {
        userId: access.userId,
        platform: parsed.data.platform,
        shell: "houzzatpro",
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        registered: true,
        shell: "houzzatpro" as const,
        platform: parsed.data.platform,
        userId: access.userId,
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
