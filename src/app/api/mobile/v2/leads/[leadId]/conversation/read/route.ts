/**
 * Mobile v2 — POST /api/mobile/v2/leads/[leadId]/conversation/read
 *
 * Marks agent read cursor via markAgentLeadConversationRead.
 */

import { NextResponse } from "next/server";
import { markAgentLeadConversationRead } from "@/lib/conversations/agent-conversation-read";
import { authorizeMobileChatContext } from "@/lib/mobile/v2/chat-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ leadId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const access = await authorizeMobileChatContext(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const { leadId } = await params;
    const result = await markAgentLeadConversationRead(
      prisma,
      access.ctx,
      leadId,
    );
    if (!result.ok) {
      if (result.reason === "FORBIDDEN") {
        return NextResponse.json(
          { ok: false, code: "WORKSPACE_FORBIDDEN", message: "Forbidden" },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
