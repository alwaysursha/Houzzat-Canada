import { loadLeadProfileEmailsPanel } from "@/lib/agent/lead-profile-panels";
import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads/[id]/emails",
    ({ ctx, id, request: req }) => {
      const url = new URL(req.url);
      const beforeRaw = url.searchParams.get("before");
      const before = beforeRaw ? new Date(beforeRaw) : null;
      return loadLeadProfileEmailsPanel(ctx, id, {
        before: before && !Number.isNaN(before.getTime()) ? before : null,
      });
    },
  );
}
