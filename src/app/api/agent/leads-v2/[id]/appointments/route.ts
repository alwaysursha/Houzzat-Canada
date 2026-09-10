import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2Appointments } from "@/lib/agent/lead-profile-v2/load-appointments";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/appointments",
    ({ ctx, id }) => loadLeadProfileV2Appointments(ctx, id),
  );
}
