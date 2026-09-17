import { requireAgentContextFromRequest } from "@/lib/agent";
import {
  createPrismaAgentInboxListDb,
  getAgentInboxListResponse,
} from "@/lib/conversations/agent-inbox-list";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { jsonByteLength } from "@/lib/http/json-body";
import { prisma } from "@/lib/prisma";

const ROUTE = "/api/agent/conversations";

export async function GET(request: Request) {
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
        method: "GET",
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
    const ctx = await requireAgentContextFromRequest(request, {
      sideEffects: false,
    });
    const result = await getAgentInboxListResponse(
      createPrismaAgentInboxListDb(prisma),
      ctx,
      new URL(request.url),
    );
    return reply(result.status, result.body);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Failed to load" }, error);
    }
    return reply(500, { error: "Failed to load" }, error);
  }
}
