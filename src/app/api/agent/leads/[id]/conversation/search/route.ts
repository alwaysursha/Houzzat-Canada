import { requireAgentContextFromRequest } from "@/lib/agent";
import { loadAccessibleAgentConversationLead } from "@/lib/conversations/agent-conversation-read";
import { handleConversationSearchRequest } from "@/lib/conversations/chat-rich-features";
import { findLeadConversation } from "@/lib/conversations/lead-conversation";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: leadId } = await params;
    const lead = await loadAccessibleAgentConversationLead(prisma, ctx, leadId);
    if (!lead?.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const conversation = await findLeadConversation(prisma, {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
    });
    if (!conversation) {
      return NextResponse.json({
        query: "",
        hits: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      });
    }

    const result = await handleConversationSearchRequest(prisma, {
      workspaceId: lead.workspaceId,
      conversationId: conversation.id,
      url: new URL(request.url),
    });
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to search" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
