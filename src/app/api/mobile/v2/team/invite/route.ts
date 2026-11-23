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
  firstName: z.string().trim().max(80).optional().default(""),
  lastName: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  designation: z.string().trim().max(80).optional().default(""),
  jurisdiction: z.string().trim().max(16).optional().default(""),
  recoLicenseNumber: z.string().trim().max(40).optional().default(""),
  recoLicenseExpiresAt: z.string().trim().max(32).optional().default(""),
  registrationNumber: z.string().trim().max(40).optional().default(""),
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

    const result = await createWorkspaceInvite({
      ctx,
      email: parsed.data.email,
      role: parsed.data.role,
      profile: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        designation: parsed.data.designation,
        jurisdiction: parsed.data.jurisdiction,
        recoLicenseNumber: parsed.data.recoLicenseNumber,
        recoLicenseExpiresAt: parsed.data.recoLicenseExpiresAt,
        registrationNumber: parsed.data.registrationNumber,
      },
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
