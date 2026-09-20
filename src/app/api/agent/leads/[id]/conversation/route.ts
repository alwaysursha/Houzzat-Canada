import { requireAgentContextFromRequest } from "@/lib/agent";
import {
  openAgentLeadConversation,
  parseAgentConversationPageParams,
} from "@/lib/conversations/agent-conversation-read";
import { resolveAgentSmsSendEligibility } from "@/lib/conversations/agent-conversation-sms";
import { listRenderedSmsQuickTextsForLead } from "@/lib/conversations/sms-quick-texts";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { jsonByteLength } from "@/lib/http/json-body";
import { prisma } from "@/lib/prisma";
import { inspectSmsAllowance, SMS_MANUAL_USAGE_CATEGORIES } from "@/lib/sms/usage";

type Params = { params: Promise<{ id: string }> };

const ROUTE = "/api/agent/leads/[id]/conversation";

export async function GET(request: Request, { params }: Params) {
  const requestId = createRequestId();
  const startedAt = Date.now();

  const reply = (status: number, body: unknown, error?: unknown) => {
    let jsonBytes: number | undefined;
    if (status !== 200) {
      try {
        jsonBytes = jsonByteLength(body);
      } catch {
        jsonBytes = undefined;
      }
    }
    try {
      logJsonApi({
        requestId,
        route: ROUTE,
        method: "GET",
        status,
        durationMs: Date.now() - startedAt,
        jsonBytes,
        ...exceptionLogFields(error),
      });
    } catch {
      // Logging must never replace a JSON response.
    }
    return jsonApiResponse(body, { status, requestId });
  };

  try {
    const ctx = await requireAgentContextFromRequest(request, {
      sideEffects: false,
    });
    if (!ctx) {
      return reply(401, { error: "Unauthorized" });
    }

    const page = parseAgentConversationPageParams(new URL(request.url));
    if (!page.ok) {
      return reply(400, { error: "Invalid cursor" });
    }

    const { id } = await params;
    const data = await openAgentLeadConversation(prisma, ctx, id, page.value);
    if (!data) {
      return reply(404, { error: "Not found" });
    }
    const smsEligibility = await resolveAgentSmsSendEligibility(
      prisma,
      ctx,
      id,
    );
    let smsSend = {
      enabled: Boolean(smsEligibility?.enabled),
      reason: smsEligibility?.enabled
        ? null
        : (smsEligibility?.reason ?? "NO_CUSTOMER_E164"),
    };
    if (smsSend.enabled && ctx.workspaceId) {
      try {
        const allowance = await inspectSmsAllowance(ctx.workspaceId, {
          categories: SMS_MANUAL_USAGE_CATEGORIES,
        });
        if (!allowance.permitted) {
          smsSend = {
            enabled: false,
            reason: allowance.reason ?? "ALLOWANCE_NOT_CONFIGURED",
          };
        }
      } catch {
        smsSend = {
          enabled: false,
          reason: "ALLOWANCE_NOT_CONFIGURED",
        };
      }
    }
    let smsQuickTexts: Awaited<
      ReturnType<typeof listRenderedSmsQuickTextsForLead>
    > = [];
    try {
      smsQuickTexts = await listRenderedSmsQuickTextsForLead(
        prisma as never,
        ctx,
        id,
      );
    } catch {
      smsQuickTexts = [];
    }
    return reply(200, {
      ...data,
      smsSend,
      smsQuickTexts,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Failed to load" }, error);
    }
    return reply(500, { error: "Failed to load" }, error);
  }
}
