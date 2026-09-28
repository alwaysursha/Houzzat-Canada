import { NextResponse } from "next/server";
import { scheduleCustomerContactRequestNotice } from "@/lib/account/contact-update-notify";
import { requireAgentContextFromRequest } from "@/lib/agent";
import { requireMobileCallOutcomeContext, canAccessLeadForMobileCallOutcome } from "@/lib/agent/call-outcome-mobile-context";
import {
  callOutcomeHttpResponse,
  deliverCallOutcomeNotice,
  postAgentCallOutcome,
  type CallOutcomeDb,
} from "@/lib/agent/call-outcome";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const web = await requireAgentContextFromRequest(request);
  const mobile = web ? null : await requireMobileCallOutcomeContext(request);
  const result = await postAgentCallOutcome(request, {
    requireAgentContext: async () => web ?? mobile,
    ...(mobile ? { canAccessLead: canAccessLeadForMobileCallOutcome } : {}),
    db: prisma as unknown as CallOutcomeDb,
  });

  if (!result.ok) {
    return result.response;
  }

  deliverCallOutcomeNotice(
    result.saved,
    scheduleCustomerContactRequestNotice,
  );

  const body = await callOutcomeHttpResponse(result.saved).json();
  return NextResponse.json(body);
}
