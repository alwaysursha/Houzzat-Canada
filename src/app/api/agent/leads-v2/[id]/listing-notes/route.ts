import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2ListingNotes } from "@/lib/agent/lead-profile-v2/load-listing-notes";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/listing-notes",
    ({ ctx, id }) => loadLeadProfileV2ListingNotes(ctx, id),
  );
}
