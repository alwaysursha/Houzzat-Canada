import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2RoutePlanner } from "@/lib/agent/lead-profile-v2/load-route-planner";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/route-planner",
    ({ ctx, id }) => loadLeadProfileV2RoutePlanner(ctx, id),
  );
}
