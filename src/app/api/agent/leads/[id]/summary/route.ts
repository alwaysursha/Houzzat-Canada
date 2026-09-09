import { requireAgentContextFromRequest } from "@/lib/agent";
import { loadLeadSummary } from "@/lib/agent/lead-summary";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { jsonByteLength } from "@/lib/http/json-body";

type Params = { params: Promise<{ id: string }> };

const ROUTE = "/api/agent/leads/[id]/summary";

export async function GET(request: Request, { params }: Params) {
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
    if (!ctx) {
      return reply(401, { error: "Unauthorized" });
    }

    const { id } = await params;
    const summary = await loadLeadSummary(ctx, id);
    if (!summary) {
      return reply(404, { error: "Not found" });
    }

    return reply(200, summary);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Failed to load" }, error);
    }
    return reply(500, { error: "Failed to load" }, error);
  }
}
