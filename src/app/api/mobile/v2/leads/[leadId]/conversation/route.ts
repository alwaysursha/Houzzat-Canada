/**
 * Mobile v2 — GET /api/mobile/v2/leads/[leadId]/conversation
 *
 * Opens the real Lead Conversation thread (Conversation + Message).
 * Singular path — plural /conversations remains LeadEmailLog (Stage 4.8).
 */

import { NextResponse } from "next/server";
import {
  openAgentLeadConversation,
  parseAgentConversationPageParams,
} from "@/lib/conversations/agent-conversation-read";
import { resolveAgentSmsSendEligibility } from "@/lib/conversations/agent-conversation-sms";
import { listRenderedSmsQuickTextsForLead } from "@/lib/conversations/sms-quick-texts";
import { authorizeMobileChatContext } from "@/lib/mobile/v2/chat-context";
import { prisma } from "@/lib/prisma";
import { inspectSmsAllowance, SMS_MANUAL_USAGE_CATEGORIES } from "@/lib/sms/usage";

export const runtime = "nodejs";

type Params = { params: Promise<{ leadId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const access = await authorizeMobileChatContext(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const page = parseAgentConversationPageParams(new URL(request.url));
    if (!page.ok) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid cursor" },
        { status: 400 },
      );
    }

    const { leadId } = await params;
    const data = await openAgentLeadConversation(
      prisma,
      access.ctx,
      leadId,
      page.value,
    );
    if (!data) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Not found" },
        { status: 404 },
      );
    }

    const smsEligibility = await resolveAgentSmsSendEligibility(
      prisma,
      access.ctx,
      leadId,
    );
    let smsSend = {
      enabled: Boolean(smsEligibility?.enabled),
      reason: smsEligibility?.enabled
        ? null
        : (smsEligibility?.reason ?? "NO_CUSTOMER_E164"),
    };
    if (smsSend.enabled && access.ctx.workspaceId) {
      try {
        const allowance = await inspectSmsAllowance(access.ctx.workspaceId, {
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
        access.ctx,
        leadId,
      );
    } catch {
      smsQuickTexts = [];
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        smsSend,
        smsQuickTexts,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
