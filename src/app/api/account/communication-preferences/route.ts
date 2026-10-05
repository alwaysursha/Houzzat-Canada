import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { getCustomerCommunicationPreferences } from "@/lib/communications/customer-preferences";
import { parseCustomerOptionalEmailCategory } from "@/lib/communications/category-map";
import { toPublicPreferenceCenterPayload } from "@/lib/communications/preference-email-chrome";
import {
  setCategoryEmailPreference,
  setGlobalOptionalEmailPreference,
} from "@/lib/communications/preference-commands";
import { prismaCommunicationPreferenceStore } from "@/lib/communications/preference-store";
import { prismaPreferenceCommandContext } from "@/lib/communications/prisma-preference-context";
import { prismaEmailSuppressionStore } from "@/lib/communications/stores";

const patchSchema = z.object({
  category: z.string().min(1).optional(),
  channel: z.literal("email").optional(),
  enabled: z.boolean().optional(),
  globalOptionalEmail: z.boolean().optional(),
});

function commandContext() {
  return prismaPreferenceCommandContext();
}

export async function GET() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const preferences = await getCustomerCommunicationPreferences({
    userId: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    emailAlertsEnabled: user.emailAlertsEnabled,
    preferenceStore: prismaCommunicationPreferenceStore(),
    suppressionStore: prismaEmailSuppressionStore(),
  });

  return NextResponse.json({
    ok: true,
    preferences: toPublicPreferenceCenterPayload(preferences),
  });
}

export async function PATCH(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!user.workspaceId) {
    return NextResponse.json({ error: "Workspace required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
  }

  const ctx = commandContext();
  const source = "preference_center_authenticated";

  if (parsed.data.globalOptionalEmail !== undefined) {
    const result = await setGlobalOptionalEmailPreference(ctx, {
      userId: user.id,
      workspaceId: user.workspaceId,
      enabled: parsed.data.globalOptionalEmail,
      source,
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    if (!result.ok) {
      const status =
        result.error === "workspace_mismatch" ||
        result.error === "workspace_required"
          ? 403
          : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    const preferences = await getCustomerCommunicationPreferences({
      userId: user.id,
      workspaceId: user.workspaceId,
      email: user.email,
      emailAlertsEnabled: result.nextEnabled,
      preferenceStore: prismaCommunicationPreferenceStore(),
      suppressionStore: prismaEmailSuppressionStore(),
    });
    return NextResponse.json({
      ok: true,
      preferences: toPublicPreferenceCenterPayload(preferences),
    });
  }

  if (
    parsed.data.category === undefined ||
    parsed.data.enabled === undefined
  ) {
    return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
  }
  if (!parseCustomerOptionalEmailCategory(parsed.data.category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }

  const result = await setCategoryEmailPreference(ctx, {
    userId: user.id,
    workspaceId: user.workspaceId,
    category: parsed.data.category,
    channel: parsed.data.channel ?? "email",
    enabled: parsed.data.enabled,
    source,
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    const status =
      result.error === "workspace_mismatch" ||
      result.error === "workspace_required"
        ? 403
        : result.error === "user_not_found"
          ? 404
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    preferences: toPublicPreferenceCenterPayload(result.preferences),
  });
}
