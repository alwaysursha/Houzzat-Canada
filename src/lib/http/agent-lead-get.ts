import {
  requireAgentContextFromRequest,
  type AgentOrgContext,
} from "@/lib/agent";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { jsonByteLength } from "@/lib/http/json-body";

type Params = Promise<{ id: string }>;

export async function handleAgentLeadGet<T>(
  request: Request,
  params: Params,
  route: string,
  load: (args: {
    ctx: AgentOrgContext;
    id: string;
    request: Request;
  }) => Promise<T | null>,
) {
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
        route,
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
    if (!ctx) {
      return reply(401, { error: "Unauthorized" });
    }
    const { id } = await params;
    const data = await load({ ctx, id, request });
    if (!data) {
      return reply(404, { error: "Not found" });
    }
    return reply(200, data);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Failed to load" }, error);
    }
    return reply(500, { error: "Failed to load" }, error);
  }
}
