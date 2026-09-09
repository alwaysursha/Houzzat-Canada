import { findAccessibleLead } from "@/lib/agent/lead-summary";
import {
  isDefaultActivityFilters,
  loadPagedLeadTimeline,
  type TimelineScope,
} from "@/lib/agent/lead-profile-timeline";
import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params.params,
    "/api/agent/leads/[id]/timeline",
    async ({ ctx, id, request: req }) => {
      const lead = await findAccessibleLead(ctx, id);
      if (!lead) return null;
      const url = new URL(req.url);
      const scopeRaw = url.searchParams.get("scope");
      const scope: TimelineScope =
        scopeRaw === "history" ? "history" : "recent";
      const beforeRaw = url.searchParams.get("before");
      const before = beforeRaw ? new Date(beforeRaw) : null;
      const filtersRaw = url.searchParams.get("filters");
      const filterIds = filtersRaw
        ? filtersRaw.split(",").map((id) => id.trim()).filter(Boolean)
        : null;
      const page = await loadPagedLeadTimeline({
        leadId: lead.id,
        customerId: lead.customerId,
        scope:
          filterIds &&
          !isDefaultActivityFilters(filterIds)
            ? "history"
            : scope,
        before:
          before && !Number.isNaN(before.getTime()) ? before : null,
        filterIds,
      });
      return page;
    },
  );
}
