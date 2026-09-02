/**
 * Stage 5.10 — GET/PATCH /api/mobile/v2/notification-preferences
 *
 * Same User.pushNotificationPrefs + staffCategoriesForUi / mergeStaffCategoryPrefs
 * as web /agent/notifications. USER GLOBAL (not workspace-scoped).
 *
 * Does NOT touch CASL / consumer emailAlertsEnabled / smsAlertsEnabled.
 * Does NOT rewrite Firebase — reports registered PushDevice count only.
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  isStaffNotificationCategory,
  mergeStaffCategoryPrefs,
  staffCategoriesForUi,
  type StaffCategoryChannel,
} from "@/lib/notifications/staff-categories";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const patchSchema = z.object({
  category: z.string(),
  channel: z.enum(["push", "email"]),
  enabled: z.boolean(),
});

async function loadDeviceSummary(userId: string) {
  const registeredDevices = await prisma.pushDevice.count({
    where: { userId, shell: "houzzatpro" },
  });
  return {
    registeredDevices,
    shell: "houzzatpro" as const,
  };
}

export async function GET(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: access.userId },
      select: { pushNotificationPrefs: true, disabledAt: true, email: true },
    });
    if (!user || user.disabledAt) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", message: "User unavailable" },
        { status: 401 },
      );
    }

    const categories = staffCategoriesForUi(user.pushNotificationPrefs);
    const device = await loadDeviceSummary(access.userId);

    return NextResponse.json({
      ok: true,
      data: {
        scope: "user_global" as const,
        categories,
        staffEmail: user.email,
        device,
        meta: {
          caslNotConfigurableHere: true,
          smsPreferenceNotCanonicalForStaff: true,
          inboundEmailCanonical: false,
        },
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

export async function PATCH(request: Request) {
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

    // Reject unknown top-level keys (whitelist only).
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid preferences" },
        { status: 400 },
      );
    }
    const keys = Object.keys(json as Record<string, unknown>);
    const allowed = new Set(["category", "channel", "enabled"]);
    if (keys.some((k) => !allowed.has(k))) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Unknown preference fields",
        },
        { status: 400 },
      );
    }

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid preferences" },
        { status: 400 },
      );
    }
    if (!isStaffNotificationCategory(parsed.data.category)) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid category" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: access.userId },
      select: {
        id: true,
        pushNotificationPrefs: true,
        disabledAt: true,
        email: true,
      },
    });
    if (!user || user.disabledAt) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", message: "User unavailable" },
        { status: 401 },
      );
    }

    const next = mergeStaffCategoryPrefs(user.pushNotificationPrefs, {
      category: parsed.data.category,
      channel: parsed.data.channel as StaffCategoryChannel,
      enabled: parsed.data.enabled,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        pushNotificationPrefs: next as Prisma.InputJsonValue,
      },
    });

    const categories = staffCategoriesForUi(next);
    const device = await loadDeviceSummary(access.userId);

    return NextResponse.json({
      ok: true,
      data: {
        scope: "user_global" as const,
        categories,
        staffEmail: user.email,
        device,
        meta: {
          caslNotConfigurableHere: true,
          smsPreferenceNotCanonicalForStaff: true,
          inboundEmailCanonical: false,
        },
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
