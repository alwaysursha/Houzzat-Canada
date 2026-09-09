import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileSnapshot } from "@/lib/agent/lead-profile-snapshot";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads/[id]/summary",
    ({ ctx, id }) => loadLeadProfileSnapshot(ctx, id),
  );
}
