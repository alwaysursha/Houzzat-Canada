import { NextResponse } from "next/server";
import {
  setGlobalOptionalEmailPreference,
} from "@/lib/communications/preference-commands";
import { prismaPreferenceCommandContext } from "@/lib/communications/prisma-preference-context";
import {
  allowPreferenceTokenMutation,
  clientIpFromPublicRequest,
} from "@/lib/communications/preference-token-rate-limit";
import { hashPreferenceToken } from "@/lib/communications/preference-token-crypto";
import {
  resolvePreferenceAccessToken,
} from "@/lib/communications/preference-token-service";
import { prismaCommunicationPreferenceTokenStore } from "@/lib/communications/preference-token-store";

function invalid() {
  return NextResponse.json({ error: "invalid_token" }, { status: 401 });
}

/** GET must never unsubscribe. */
export async function GET() {
  return new NextResponse("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ip = clientIpFromPublicRequest(request);
  if (
    !allowPreferenceTokenMutation({
      clientIp: ip,
      tokenHashPrefix: token ? hashPreferenceToken(token).slice(0, 16) : "none",
    })
  ) {
    return invalid();
  }

  const resolved = await resolvePreferenceAccessToken(token, {
    expectedPurpose: "one_click",
  });
  if (!resolved.ok) {
    return invalid();
  }

  const result = await setGlobalOptionalEmailPreference(
    prismaPreferenceCommandContext(),
    {
      userId: resolved.resolved.user.id,
      workspaceId: resolved.resolved.user.workspaceId,
      enabled: false,
      source: "one_click_unsubscribe",
    },
  );
  if (!result.ok) {
    return invalid();
  }
  await prismaCommunicationPreferenceTokenStore().touchLastUsed(
    resolved.resolved.record.id,
    new Date(),
  );
  return new NextResponse(null, { status: 200 });
}
