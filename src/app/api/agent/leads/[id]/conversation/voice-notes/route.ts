import { requireAgentContextFromRequest } from "@/lib/agent";
import { sendAgentLeadVoiceNote } from "@/lib/conversations/agent-conversation-voice";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const result = await sendAgentLeadVoiceNote(prisma, ctx, id, request);
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to send" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
