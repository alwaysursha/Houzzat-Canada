import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2Shell } from "@/lib/agent/lead-profile-v2/load-shell";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/shell",
    ({ ctx, id }) => loadLeadProfileV2Shell(ctx, id),
  );
}
