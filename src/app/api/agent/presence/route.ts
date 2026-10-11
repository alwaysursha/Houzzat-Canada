import { NextResponse } from "next/server";
import { requireAgentContextFromRequest } from "@/lib/agent";
import type { AgentPresenceDb } from "@/lib/chat/presence/update";
import { handleAgentPresenceUpdate } from "@/lib/conversations/agent-presence";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await handleAgentPresenceUpdate(
      prisma as unknown as AgentPresenceDb,
      ctx,
      request,
    );
    if (!result.ok) {
      const headers =
        result.status === 429 &&
        result.body &&
        typeof result.body === "object" &&
        "retryAfterSec" in result.body
          ? {
              "Retry-After": String(
                (result.body as { retryAfterSec?: number }).retryAfterSec ?? 1,
              ),
            }
          : undefined;
      return NextResponse.json(result.body, {
        status: result.status,
        headers,
      });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to update" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
