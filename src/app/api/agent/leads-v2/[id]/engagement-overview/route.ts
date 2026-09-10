import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2EngagementOverview } from "@/lib/agent/lead-profile-v2/load-engagement-overview";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/engagement-overview",
    ({ ctx, id }) => loadLeadProfileV2EngagementOverview(ctx, id),
  );
}
