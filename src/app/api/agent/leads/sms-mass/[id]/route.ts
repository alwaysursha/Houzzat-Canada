import { requireAgentContextFromRequest } from "@/lib/agent";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { prisma } from "@/lib/prisma";
import { getMassSmsBatch, prismaMassSmsDb } from "@/lib/sms/mass";

const ROUTE = "/api/agent/leads/sms-mass/[id]";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const requestId = createRequestId();
  const startedAt = Date.now();

  const reply = (status: number, body: unknown, error?: unknown) => {
    try {
      logJsonApi({
        requestId,
        route: ROUTE,
        method: "GET",
        status,
        durationMs: Date.now() - startedAt,
        ...exceptionLogFields(error),
      });
    } catch {
      // Logging must never replace a JSON response.
    }
    return jsonApiResponse(body, { status, requestId });
  };

  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) return reply(401, { error: "Unauthorized" });

    const { id } = await params;
    const batch = await getMassSmsBatch(prismaMassSmsDb(prisma), ctx, id);
    if (!batch) return reply(404, { error: "Not found" });
    return reply(200, { ok: true, batch });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Service unavailable" }, error);
    }
    return reply(500, { error: "Internal error" }, error);
  }
}
