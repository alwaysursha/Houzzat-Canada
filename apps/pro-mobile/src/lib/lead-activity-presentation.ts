import { leadActivityDisplayTitle } from "../../../../src/lib/agent/activity-display";
import {
  CALL_OUTCOME_ACTIVITY_LABEL,
  presentCallLeadActivity,
  type CallOutcomeId,
} from "../../../../src/lib/agent/call-outcome-presentation";

function outcomeMetaFromCallBody(body: string | null): { outcome: CallOutcomeId } | null {
  if (!body) return null;
  for (const [outcome, label] of Object.entries(CALL_OUTCOME_ACTIVITY_LABEL)) {
    if (body === label) return { outcome: outcome as CallOutcomeId };
  }
  return null;
}

/**
 * Lead Detail timeline copy. Does not change stored types.
 * CALL rows use the same outcome labels as Web; contact_update_request
 * uses the shared CRM headline.
 */
export function presentMobileLeadActivity(input: {
  type: string;
  body: string | null;
}): { title: string; body: string | null } {
  const inferred = outcomeMetaFromCallBody(input.body);
  const call = presentCallLeadActivity({
    type: input.type,
    body: input.body,
    meta: inferred,
  });
  if (call) return call;

  if (input.type === "contact_update_request") {
    return {
      title: leadActivityDisplayTitle({
        type: input.type,
        body: input.body,
      }),
      body: input.body,
    };
  }

  return { title: "", body: input.body };
}
