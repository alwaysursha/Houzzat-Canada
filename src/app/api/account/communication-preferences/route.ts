import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { getCustomerCommunicationPreferences } from "@/lib/communications/customer-preferences";
import { parseCustomerOptionalEmailCategory } from "@/lib/communications/category-map";
import { setCategoryEmailPreference } from "@/lib/communications/preference-commands";
import { prismaCommunicationPreferenceStore } from "@/lib/communications/preference-store";
import { prismaPreferenceCommandContext } from "@/lib/communications/prisma-preference-context";
import { prismaEmailSuppressionStore } from "@/lib/communications/stores";

const patchSchema = z.object({
  category: z.string().min(1),
  channel: z.literal("email"),
  enabled: z.boolean(),
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

  return NextResponse.json({ ok: true, preferences });
}

export async function PATCH(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!user.workspaceId) {
    return NextResponse.json({ error: "Workspace required." }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
  }
  if (!parseCustomerOptionalEmailCategory(parsed.data.category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }

  const result = await setCategoryEmailPreference(commandContext(), {
    userId: user.id,
    workspaceId: user.workspaceId,
    category: parsed.data.category,
    channel: parsed.data.channel,
    enabled: parsed.data.enabled,
    source: "account_api",
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

  return NextResponse.json({ ok: true, preferences: result.preferences });
}
