/**
 * Stage 4.1 / Phase 3 — POST /api/mobile/v2/auth/login
 *
 * Two explicit modes (no silent NULL-workspace fallback for tenants):
 *
 * 1) Tenant: { email, password, workspaceId }
 *    → authenticate User(workspaceId, email) + password only
 *
 * 2) Platform: { email, password, mode: "platform" }
 *    → authenticate NULL-workspace User ONLY if PlatformOperator is ACTIVE
 *    → ordinary orphans / pre-split consumers must NOT succeed
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
import {
  findNullWorkspaceUserByEmail,
  findTenantUserByEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/workspace-identity";

export const runtime = "nodejs";

const loginSchema = z
  .object({
    email: z.string().email().min(3).max(200),
    password: z.string().min(1).max(200),
    workspaceId: z.string().trim().min(1).max(64).optional(),
    mode: z.enum(["platform", "tenant"]).optional(),
  })
  .superRefine((value, ctx) => {
    const mode = value.mode ?? (value.workspaceId ? "tenant" : undefined);
    if (mode === "tenant" && !value.workspaceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "workspaceId required for tenant login",
        path: ["workspaceId"],
      });
    }
    if (!mode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mode "platform" or workspaceId required',
        path: ["mode"],
      });
    }
  });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid login payload",
        },
        { status: 400 },
      );
    }

    const email = normalizeIdentityEmail(parsed.data.email);
    const password = parsed.data.password;
    const mode =
      parsed.data.mode ?? (parsed.data.workspaceId ? "tenant" : "platform");

    if (mode === "tenant") {
      const workspaceId = parsed.data.workspaceId!;
      const user = await findTenantUserByEmail(workspaceId, email);
      if (!user?.password || user.disabledAt) {
        return NextResponse.json(
          {
            ok: false,
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
          { status: 401 },
        );
      }
      const passwordValid = await bcrypt.compare(password, user.password);
      if (!passwordValid) {
        return NextResponse.json(
          {
            ok: false,
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
          { status: 401 },
        );
      }

      const platformToken = createPlatformAccessToken({
        id: user.id,
        email: user.email,
      });
      const refreshToken = createMobileRefreshToken({
        id: user.id,
        email: user.email,
      });
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
            workspaceId,
          },
          tokens: {
            accessToken: platformToken.token,
            refreshToken: refreshToken.token,
            expiresAt: platformToken.expiresAt,
          },
        },
      });
    }

    // Explicit platform mode — PlatformOperator only (never orphans / Omer).
    const user = await findNullWorkspaceUserByEmail(email);
    if (!user?.password || user.disabledAt) {
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
        { status: 401 },
      );
    }

    const operator = await prisma.platformOperator.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (!operator || operator.status !== "ACTIVE") {
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
        { status: 401 },
      );
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
        { status: 401 },
      );
    }

    const platformToken = createPlatformAccessToken({
      id: user.id,
      email: user.email,
    });
    const refreshToken = createMobileRefreshToken({
      id: user.id,
      email: user.email,
    });
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
          workspaceId: null,
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
