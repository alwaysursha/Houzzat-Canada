import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2LookingFor } from "@/lib/agent/lead-profile-v2/load-looking-for";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/looking-for",
    ({ ctx, id }) => loadLeadProfileV2LookingFor(ctx, id),
  );
}
