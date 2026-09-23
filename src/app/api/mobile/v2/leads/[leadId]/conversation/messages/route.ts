/**
 * Mobile v2 — POST /api/mobile/v2/leads/[leadId]/conversation/messages
 *
 * Sends CHAT or SMS via existing agent conversation send services.
 */

import { NextResponse } from "next/server";
import {
  agentConversationSendRequestSchema,
  sendAgentLeadChatMessage,
} from "@/lib/conversations/agent-conversation-send";
import { sendAgentLeadSmsMessage } from "@/lib/conversations/agent-conversation-sms";
import { parseJsonText } from "@/lib/http/json-body";
import { authorizeMobileChatContext } from "@/lib/mobile/v2/chat-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ leadId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const access = await authorizeMobileChatContext(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const parsedJson = parseJsonText(await request.text());
    if (parsedJson.parse !== "ok") {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid payload" },
        { status: 400 },
      );
    }
    const parsed = agentConversationSendRequestSchema.safeParse(parsedJson.data);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid payload" },
        { status: 400 },
      );
    }

    const { leadId } = await params;
    const channel = parsed.data.channel ?? "CHAT";
    const result =
      channel === "SMS"
        ? await sendAgentLeadSmsMessage(
            prisma,
            access.ctx,
            leadId,
            parsed.data.body,
          )
        : await sendAgentLeadChatMessage(
            prisma,
            access.ctx,
            leadId,
            parsed.data.body,
          );

    if (!result.ok) {
      if (result.reason === "FORBIDDEN") {
        return NextResponse.json(
          { ok: false, code: "WORKSPACE_FORBIDDEN", message: "Forbidden" },
          { status: 403 },
        );
      }
      if (result.reason === "INVALID_BODY") {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "Invalid payload" },
          { status: 400 },
        );
      }
      if (result.reason === "NOT_ASSIGNED") {
        return NextResponse.json(
          {
            ok: false,
            code: "WORKSPACE_FORBIDDEN",
            message: "Only the assigned agent can send SMS.",
          },
          { status: 403 },
        );
      }
      if (
        result.reason === "NO_CUSTOMER_E164" ||
        result.reason === "NO_WORKSPACE_NUMBER" ||
        result.reason === "SUPPRESSED" ||
        result.reason === "ALLOWANCE_NOT_CONFIGURED" ||
        result.reason === "ALLOWANCE_EXCEEDED"
      ) {
        return NextResponse.json(
          {
            ok: false,
            code: "VALIDATION_ERROR",
            message:
              result.reason === "NO_CUSTOMER_E164"
                ? "SMS is unavailable — this lead has no valid mobile number."
                : result.reason === "NO_WORKSPACE_NUMBER"
                  ? "SMS is unavailable — this workspace has no Twilio number."
                  : result.reason === "SUPPRESSED"
                    ? "SMS is unavailable — this number has opted out of SMS."
                    : result.reason === "ALLOWANCE_EXCEEDED"
                      ? "SMS is unavailable — this workspace has used its included SMS allowance."
                      : "SMS is unavailable — this workspace has no SMS allowance configured.",
          },
          { status: 409 },
        );
      }
      if (result.reason === "SMS_TRANSPORT_UNAVAILABLE") {
        return NextResponse.json(
          {
            ok: false,
            code: "SERVER_ERROR",
            message: "SMS is unavailable right now.",
          },
          { status: 503 },
        );
      }
      if (result.reason === "SMS_SEND_FAILED") {
        return NextResponse.json(
          {
            ok: false,
            code: "SERVER_ERROR",
            message: "Failed to send SMS.",
          },
          { status: 502 },
        );
      }
      if (result.reason === "SMS_SENT_NOT_SAVED") {
        return NextResponse.json(
          {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "SMS was sent. Do not send it again.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
