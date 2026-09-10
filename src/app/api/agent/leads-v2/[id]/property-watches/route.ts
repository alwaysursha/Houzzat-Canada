import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2PropertyWatches } from "@/lib/agent/lead-profile-v2/load-property-watches";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/property-watches",
    ({ ctx, id }) => loadLeadProfileV2PropertyWatches(ctx, id),
  );
}
