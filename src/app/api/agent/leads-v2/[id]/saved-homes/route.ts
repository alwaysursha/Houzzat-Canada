import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2SavedHomes } from "@/lib/agent/lead-profile-v2/load-saved-homes";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/saved-homes",
    ({ ctx, id }) => loadLeadProfileV2SavedHomes(ctx, id),
  );
}
