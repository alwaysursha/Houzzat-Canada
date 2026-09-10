import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2Tasks } from "@/lib/agent/lead-profile-v2/load-tasks";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/tasks",
    ({ ctx, id }) => loadLeadProfileV2Tasks(ctx, id),
  );
}
