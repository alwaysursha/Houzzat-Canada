import { loadLeadProfileAppointmentsPanel } from "@/lib/agent/lead-profile-panels";
import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads/[id]/appointments",
    ({ ctx, id }) => loadLeadProfileAppointmentsPanel(ctx, id),
  );
}
