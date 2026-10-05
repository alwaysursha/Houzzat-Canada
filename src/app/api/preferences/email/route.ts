import { NextResponse } from "next/server";
import { z } from "zod";
import { parseCustomerOptionalEmailCategory } from "@/lib/communications/category-map";
import { getCustomerCommunicationPreferences } from "@/lib/communications/customer-preferences";
import { toPublicPreferenceCenterPayload } from "@/lib/communications/preference-email-chrome";
import {
  setCategoryEmailPreference,
  setGlobalOptionalEmailPreference,
} from "@/lib/communications/preference-commands";
import { prismaCommunicationPreferenceStore } from "@/lib/communications/preference-store";
import { prismaPreferenceCommandContext } from "@/lib/communications/prisma-preference-context";
import {
  allowPreferenceTokenMutation,
  clientIpFromPublicRequest,
} from "@/lib/communications/preference-token-rate-limit";
import {
  genericInvalidTokenStatus,
  resolvePreferenceAccessToken,
} from "@/lib/communications/preference-token-service";
import { hashPreferenceToken } from "@/lib/communications/preference-token-crypto";
import { prismaEmailSuppressionStore } from "@/lib/communications/stores";
import { prismaCommunicationPreferenceTokenStore } from "@/lib/communications/preference-token-store";

const patchSchema = z.object({
  token: z.string().min(16).max(256),
  category: z.string().min(1).optional(),
  channel: z.literal("email").optional(),
  enabled: z.boolean().optional(),
  globalOptionalEmail: z.boolean().optional(),
  userId: z.string().optional(),
  workspaceId: z.string().optional(),
});

function invalidTokenResponse() {
  return NextResponse.json({ error: "invalid_token" }, { status: 401 });
}

async function loadPublicPreferences(user: {
  id: string;
  email: string;
  workspaceId: string;
  emailAlertsEnabled: boolean;
}) {
  const preferences = await getCustomerCommunicationPreferences({
    userId: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    emailAlertsEnabled: user.emailAlertsEnabled,
    preferenceStore: prismaCommunicationPreferenceStore(),
    suppressionStore: prismaEmailSuppressionStore(),
  });
  return toPublicPreferenceCenterPayload(preferences);
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const resolved = await resolvePreferenceAccessToken(token, {
    expectedPurpose: "manage",
  });
  if (!resolved.ok) {
    return invalidTokenResponse();
  }
  const preferences = await loadPublicPreferences(resolved.resolved.user);
  return NextResponse.json({ ok: true, preferences });
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (parsed.data.userId || parsed.data.workspaceId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const ip = clientIpFromPublicRequest(request);
  if (
    !allowPreferenceTokenMutation({
      clientIp: ip,
      tokenHashPrefix: hashPreferenceToken(parsed.data.token).slice(0, 16),
    })
  ) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const resolved = await resolvePreferenceAccessToken(parsed.data.token, {
    expectedPurpose: "manage",
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: genericInvalidTokenStatus(resolved.error) },
    );
  }

  const store = prismaCommunicationPreferenceTokenStore();
  const ctx = prismaPreferenceCommandContext();
  const user = resolved.resolved.user;
  const source = "preference_center_token";

  if (parsed.data.globalOptionalEmail !== undefined) {
    const result = await setGlobalOptionalEmailPreference(ctx, {
      userId: user.id,
      workspaceId: user.workspaceId,
      enabled: parsed.data.globalOptionalEmail,
      source,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    await store.touchLastUsed(resolved.resolved.record.id, new Date());
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
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
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
    ip,
    userAgent: request.headers.get("user-agent"),
  });
  if (!result.ok) {
    const status = result.error === "push_not_managed" ? 400 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  await store.touchLastUsed(resolved.resolved.record.id, new Date());
  return NextResponse.json({
    ok: true,
    preferences: toPublicPreferenceCenterPayload(result.preferences),
  });
}
