import { requireAgentContextFromRequest } from "@/lib/agent";
import {
  AGENT_LISTING_SHARE_SEARCH_LIMIT,
  parseAgentListingShareSearchQuery,
  searchAgentListingSharePicker,
  type AgentListingShareSearchDb,
} from "@/lib/conversations/agent-listing-share-search";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { getListingProvider } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";

export const runtime = "nodejs";

const ROUTE = "/api/agent/listings/share-search";

export async function GET(request: Request) {
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
    if (!ctx) {
      return reply(401, { error: "Unauthorized" });
    }
    if (!ctx.workspaceId || !ctx.isWorkspaceCrmAllowed) {
      return reply(403, { error: "Forbidden" });
    }

    const { searchParams } = new URL(request.url);
    const parsedQ = parseAgentListingShareSearchQuery(searchParams.get("q"));
    if (!parsedQ.ok) {
      if (parsedQ.reason === "EMPTY" || parsedQ.reason === "TOO_SHORT") {
        return reply(200, { items: [] });
      }
      return reply(400, { error: "Invalid query" });
    }

    // Never trust client workspace/org/provider — Host → entitlement only.
    const { entitlement } =
      await resolveListingEntitlementContextForRequest(request);

    const provider = getListingProvider();
    const result = await searchAgentListingSharePicker(
      prisma as unknown as AgentListingShareSearchDb,
      {
        q: parsedQ.q,
        entitlement,
        trustedWorkspaceId: ctx.workspaceId,
        limit: AGENT_LISTING_SHARE_SEARCH_LIMIT,
        entitlementFilteringEnabled: true,
        searchInventory: async ({ q, limit, entitlement: ent }) => {
          const searched = await provider.search({
            q,
            statuses: ["ACTIVE", "SOLD_CONDITIONAL"],
            limit,
            sort: "newest",
            entitlement: ent,
            entitlementFilteringEnabled: true,
          });
          return {
            items: searched.items.map((item) => ({
              mlsNumber: item.mlsNumber,
            })),
          };
        },
      },
    );

    if (!result.ok) {
      if (result.reason === "FORBIDDEN") {
        return reply(403, { error: "Forbidden" });
      }
      return reply(400, { error: "Invalid query" });
    }

    return reply(200, { items: result.items });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Failed to search" }, error);
    }
    return reply(500, { error: "Failed to search" }, error);
  }
}
