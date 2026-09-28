import { MOBILE_V2_API_BASE_URL } from "../types/api";
import { buildCallOutcomeRequest } from "../../../../src/lib/agent/call-outcome-presentation";
import type {
  CallOutcomeId,
  FollowUpChoice,
} from "../../../../src/lib/agent/call-outcome-presentation";

export function agentCallOutcomeUrl(
  mobileBase: string = MOBILE_V2_API_BASE_URL,
): string {
  const origin = mobileBase.replace(/\/api\/mobile\/v2\/?$/, "");
  return `${origin}/api/agent/leads/call-outcome`;
}

export function callOutcomeRequestBody(input: {
  leadId: string;
  outcome: CallOutcomeId;
  note: string;
  followUpDueAt: Date | null;
  clientRequestId: string;
}) {
  return buildCallOutcomeRequest(input);
}

export async function postMobileCallOutcome(input: {
  token: string;
  body: ReturnType<typeof buildCallOutcomeRequest>;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(agentCallOutcomeUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify(input.body),
  });
  if (!response.ok) return { ok: false };
  return { ok: true };
}

export function pickerWallClockValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type { CallOutcomeId, FollowUpChoice };
