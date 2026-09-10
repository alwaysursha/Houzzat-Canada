import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2NextReminder } from "@/lib/agent/lead-profile-v2/load-next-reminder";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/next-reminder",
    ({ ctx, id }) => loadLeadProfileV2NextReminder(ctx, id),
  );
}
