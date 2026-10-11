import { requireAgentContextFromRequest } from "@/lib/agent";
import { loadAgentLeadConversationMessageContext } from "@/lib/conversations/agent-conversation-read";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; messageId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: leadId, messageId } = await params;
    const result = await loadAgentLeadConversationMessageContext(
      prisma,
      ctx,
      leadId,
      messageId,
    );
    if (!result.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to load" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
