import { requireAgentContextFromRequest } from "@/lib/agent";
import {
  agentConversationSendRequestSchema,
  sendAgentLeadChatMessage,
} from "@/lib/conversations/agent-conversation-send";
import { sendAgentLeadSmsMessage } from "@/lib/conversations/agent-conversation-sms";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { jsonByteLength, parseJsonText } from "@/lib/http/json-body";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const ROUTE = "/api/agent/leads/[id]/conversation/messages";

export async function POST(request: Request, { params }: Params) {
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
        method: "POST",
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
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return reply(401, { error: "Unauthorized" });
    }

    const parsedJson = parseJsonText(await request.text());
    if (parsedJson.parse !== "ok") {
      return reply(400, { error: "Invalid payload" });
    }
    const parsed = agentConversationSendRequestSchema.safeParse(parsedJson.data);
    if (!parsed.success) {
      return reply(400, { error: "Invalid payload" });
    }

    const { id } = await params;
    const channel = parsed.data.channel ?? "CHAT";
    const result =
      channel === "SMS"
        ? await sendAgentLeadSmsMessage(prisma, ctx, id, parsed.data.body)
        : await sendAgentLeadChatMessage(prisma, ctx, id, parsed.data.body);
    if (!result.ok) {
      if (result.reason === "FORBIDDEN") {
        return reply(403, { error: "Forbidden" });
      }
      if (result.reason === "INVALID_BODY") {
        return reply(400, { error: "Invalid payload" });
      }
      if (result.reason === "NOT_ASSIGNED") {
        return reply(403, {
          error: "Only the assigned agent can send SMS.",
          code: result.reason,
        });
      }
      if (
        result.reason === "NO_CUSTOMER_E164" ||
        result.reason === "NO_WORKSPACE_NUMBER" ||
        result.reason === "SUPPRESSED"
      ) {
        return reply(409, {
          error:
            result.reason === "NO_CUSTOMER_E164"
              ? "SMS is unavailable — this lead has no valid mobile number."
              : result.reason === "NO_WORKSPACE_NUMBER"
                ? "SMS is unavailable — this workspace has no Twilio number."
                : "SMS is unavailable — this number has opted out of SMS.",
          code: result.reason,
        });
      }
      if (result.reason === "SMS_TRANSPORT_UNAVAILABLE") {
        return reply(503, {
          error: "SMS is unavailable right now.",
          code: result.reason,
        });
      }
      if (result.reason === "SMS_SEND_FAILED") {
        return reply(502, {
          error: "Failed to send SMS.",
          code: result.reason,
        });
      }
      if (result.reason === "SMS_SENT_NOT_SAVED") {
        return reply(409, {
          error: "SMS was sent. Do not send it again.",
          code: result.reason,
        });
      }
      return reply(404, { error: "Not found" });
    }
    return reply(200, result.data);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Failed to send" }, error);
    }
    return reply(500, { error: "Failed to send" }, error);
  }
}
