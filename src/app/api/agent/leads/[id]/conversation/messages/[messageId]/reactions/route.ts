import { requireAgentContextFromRequest } from "@/lib/agent";
import { loadAccessibleAgentConversationLead } from "@/lib/conversations/agent-conversation-read";
import { handleToggleConversationReaction } from "@/lib/conversations/chat-rich-features";
import { findLeadConversation } from "@/lib/conversations/lead-conversation";
import { normalizeChatReactionKey } from "@/lib/chat/emoji-catalog";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { parseJsonText } from "@/lib/http/json-body";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; messageId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: leadId, messageId } = await params;
    const parsedJson = parseJsonText(await request.text());
    if (parsedJson.parse !== "ok") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const keyRaw =
      parsedJson.data &&
      typeof parsedJson.data === "object" &&
      !Array.isArray(parsedJson.data) &&
      typeof (parsedJson.data as { key?: unknown }).key === "string"
        ? (parsedJson.data as { key: string }).key
        : "";
    if (!normalizeChatReactionKey(keyRaw)) {
      return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
    }

    const lead = await loadAccessibleAgentConversationLead(prisma, ctx, leadId);
    if (!lead?.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const conversation = await findLeadConversation(prisma, {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
    });
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await handleToggleConversationReaction(prisma, {
      workspaceId: lead.workspaceId,
      conversationId: conversation.id,
      messageId,
      userId: ctx.user.id,
      key: keyRaw,
    });
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to update" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
