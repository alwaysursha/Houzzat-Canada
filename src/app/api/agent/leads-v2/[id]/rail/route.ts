import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2Rail } from "@/lib/agent/lead-profile-v2/load-rail";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/rail",
    ({ ctx, id }) => loadLeadProfileV2Rail(ctx, id),
  );
}
