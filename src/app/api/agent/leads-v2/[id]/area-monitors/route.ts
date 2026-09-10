import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2AreaMonitors } from "@/lib/agent/lead-profile-v2/load-area-monitors";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/area-monitors",
    ({ ctx, id }) => loadLeadProfileV2AreaMonitors(ctx, id),
  );
}
