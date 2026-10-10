import { handleCustomerConversationVoiceAudioGet } from "@/lib/conversations/customer-conversation-voice";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ messageId: string; attachmentId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const { messageId, attachmentId } = await params;
    return await handleCustomerConversationVoiceAudioGet(
      request,
      messageId,
      attachmentId,
      { db: prisma },
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return Response.json({ error: "Failed to load" }, { status: 503 });
    }
    return Response.json({ error: "Failed to load" }, { status: 500 });
  }
}
