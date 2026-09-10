import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2Alerts } from "@/lib/agent/lead-profile-v2/load-alerts";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/alerts",
    ({ ctx, id }) => loadLeadProfileV2Alerts(ctx, id),
  );
}
