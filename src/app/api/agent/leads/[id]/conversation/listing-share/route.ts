import { requireAgentContextFromRequest } from "@/lib/agent";
import {
  agentListingShareRequestSchema,
  sendAgentLeadListingShare,
} from "@/lib/conversations/agent-conversation-listing-share";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { jsonByteLength, parseJsonText } from "@/lib/http/json-body";
import { prisma } from "@/lib/prisma";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const ROUTE = "/api/agent/leads/[id]/conversation/listing-share";

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
    if (!ctx.workspaceId || !ctx.isWorkspaceCrmAllowed) {
      return reply(403, { error: "Forbidden" });
    }

    const parsedJson = parseJsonText(await request.text());
    if (parsedJson.parse !== "ok") {
      return reply(400, { error: "Invalid payload" });
    }
    const parsed = agentListingShareRequestSchema.safeParse(parsedJson.data);
    if (!parsed.success) {
      return reply(400, { error: "Invalid payload" });
    }

    // Never trust client workspace/org/provider — Host → entitlement only.
    const { entitlement } =
      await resolveListingEntitlementContextForRequest(request);

    const { id } = await params;
    const result = await sendAgentLeadListingShare(
      prisma as never,
      ctx,
      id,
      parsed.data,
      { entitlement },
    );

    if (!result.ok) {
      switch (result.reason) {
        case "FORBIDDEN":
          return reply(403, { error: "Forbidden" });
        case "LEAD_NOT_FOUND":
        case "LISTING_NOT_FOUND":
          return reply(404, { error: "Not found" });
        case "LISTING_FORBIDDEN":
          return reply(403, { error: "Listing not available" });
        case "IDEMPOTENCY_CONFLICT":
          return reply(409, { error: "Idempotency conflict" });
        case "INVALID_BODY":
          return reply(400, { error: "Invalid payload" });
        case "CONVERSATION_FAILED":
          return reply(500, { error: "Failed to send" });
        default: {
          const _exhaustive: never = result.reason;
          return _exhaustive;
        }
      }
    }

    return reply(200, {
      conversation: result.data.conversation,
      message: result.data.message,
      replayed: result.data.replayed,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Failed to send" }, error);
    }
    return reply(500, { error: "Failed to send" }, error);
  }
}
