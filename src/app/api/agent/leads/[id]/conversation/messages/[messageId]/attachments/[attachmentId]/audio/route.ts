import { requireAgentContextFromRequest } from "@/lib/agent";
import { loadAgentLeadVoiceAttachmentAudio } from "@/lib/conversations/agent-conversation-voice";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string; messageId: string; attachmentId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, messageId, attachmentId } = await params;
    return await loadAgentLeadVoiceAttachmentAudio(
      prisma,
      ctx,
      id,
      messageId,
      attachmentId,
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return Response.json({ error: "Failed to load" }, { status: 503 });
    }
    return Response.json({ error: "Failed to load" }, { status: 500 });
  }
}
