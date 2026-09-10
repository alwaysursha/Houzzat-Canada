import { handleAgentLeadGet } from "@/lib/http/agent-lead-get";
import { loadLeadProfileV2Emails } from "@/lib/agent/lead-profile-v2/load-emails";
import { parseV2EmailsSearchParams } from "@/lib/agent/lead-profile-v2/emails-query";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleAgentLeadGet(
    request,
    params,
    "/api/agent/leads-v2/[id]/emails",
    ({ ctx, id, request: req }) => {
      const parsed = parseV2EmailsSearchParams(new URL(req.url));
      return loadLeadProfileV2Emails(ctx, id, parsed);
    },
  );
}
