/**
 * Stage 5.13 — POST /api/mobile/v2/team/invite
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import {
  buildMobileTeamContext,
  loadMobileTeamPayload,
} from "@/lib/mobile/v2/team";
import { createWorkspaceInvite } from "@/lib/workspace-invite";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["ADMIN", "AGENT"]),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  recoLicenseNumber: z.string().trim().min(1).max(40).optional(),
  recoLicenseExpiresAt: z.string().trim().min(10).max(32).optional(),
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

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Email and role required" },
        { status: 400 },
      );
    }

    const ctx = await buildMobileTeamContext({
      userId: access.userId,
      workspaceId: access.workspaceId,
      role: access.role,
    });
    if (!ctx) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN", message: "Team context unavailable" },
        { status: 403 },
      );
    }

    const { email, role, firstName, lastName, phone, recoLicenseNumber, recoLicenseExpiresAt } =
      parsed.data;
    const result = await createWorkspaceInvite({
      ctx,
      email,
      role,
      ...(firstName && lastName && phone && recoLicenseNumber && recoLicenseExpiresAt
        ? {
            profile: {
              firstName,
              lastName,
              email,
              phone,
              recoLicenseNumber,
              recoLicenseExpiresAt,
            },
          }
        : {}),
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: "TEAM_ERROR", message: result.error },
        { status: result.status ?? 400 },
      );
    }

    const data = await loadMobileTeamPayload(ctx);
    return NextResponse.json({
      ok: true,
      data: {
        invite: result.invite,
        alreadyMember: result.alreadyMember,
        convertsConsumerAccount: result.convertsConsumerAccount,
        emailStatus: result.emailStatus,
        team: data,
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
