import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2SavedSearches } from "@/lib/agent/lead-profile-v2/load-saved-searches";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/saved-searches",
    ({ ctx, id }) => loadLeadProfileV2SavedSearches(ctx, id),
  );
}
