/**
 * Mobile v2 — GET /api/mobile/v2/conversations
 *
 * Workspace-scoped agent chat inbox. Reuses getAgentInboxListResponse /
 * listAgentInboxConversations (same Conversation rows as web /agent/chats).
 * Not LeadEmailLog / Communications.
 */

import { NextResponse } from "next/server";
import {
  createPrismaAgentInboxListDb,
  getAgentInboxListResponse,
} from "@/lib/conversations/agent-inbox-list";
import { authorizeMobileChatContext } from "@/lib/mobile/v2/chat-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await authorizeMobileChatContext(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const result = await getAgentInboxListResponse(
      createPrismaAgentInboxListDb(prisma),
      access.ctx,
      new URL(request.url),
    );

    if (result.status !== 200) {
      const body = result.body as { error?: string };
      return NextResponse.json(
        {
          ok: false,
          code:
            result.status === 401
              ? "AUTH_REQUIRED"
              : result.status === 400
                ? "VALIDATION_ERROR"
                : "SERVER_ERROR",
          message: body.error ?? "Failed to load",
        },
        { status: result.status },
      );
    }

    return NextResponse.json({ ok: true, data: result.body });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
