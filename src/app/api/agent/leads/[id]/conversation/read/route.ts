import { requireAgentContextFromRequest } from "@/lib/agent";
import { markAgentLeadConversationRead } from "@/lib/conversations/agent-conversation-read";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { jsonByteLength } from "@/lib/http/json-body";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const ROUTE = "/api/agent/leads/[id]/conversation/read";

export async function POST(request: Request, { params }: Params) {
  const requestId = createRequestId();
  const startedAt = Date.now();

  const reply = (status: number, body: unknown, error?: unknown) => {
    let jsonBytes: number | undefined;
    if (status !== 200) {
      try {
        jsonBytes = jsonByteLength(body);
      } catch {
        jsonBytes = undefined;
      }
    }
    try {
      logJsonApi({
        requestId,
        route: ROUTE,
        method: "POST",
        status,
        durationMs: Date.now() - startedAt,
        jsonBytes,
        ...exceptionLogFields(error),
      });
    } catch {
      // Logging must never replace a JSON response.
    }
    return jsonApiResponse(body, { status, requestId });
  };

  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return reply(401, { error: "Unauthorized" });
    }

    const { id } = await params;
    const result = await markAgentLeadConversationRead(prisma, ctx, id);
    if (!result.ok) {
      if (result.reason === "FORBIDDEN") {
        return reply(403, { error: "Forbidden" });
      }
      return reply(404, { error: "Not found" });
    }
    return reply(200, result.data);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Failed to update" }, error);
    }
    return reply(500, { error: "Failed to update" }, error);
  }
}
