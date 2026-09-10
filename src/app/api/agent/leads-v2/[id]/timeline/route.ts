import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2Timeline } from "@/lib/agent/lead-profile-v2/load-timeline";
import { parseV2TimelineSearchParams } from "@/lib/agent/lead-profile-v2/timeline-query";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/timeline",
    async ({ ctx, id, request: req }) => {
      const parsed = parseV2TimelineSearchParams(new URL(req.url));
      return loadLeadProfileV2Timeline(ctx, id, parsed);
    },
  );
}
