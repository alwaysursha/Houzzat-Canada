/**
 * V2 GET auth: hostname → workspace → ACTIVE member → agent context → canAccessLead.
 * Reuses existing primitives. Does not change them. No client-supplied workspace.
 */
import {
  canAccessLead,
  requireAgentContextFromRequest,
  type AgentContextFromRequestOptions,
  type AgentOrgContext,
} from "@/lib/agent";

export const V2_LEAD_GET_AUTH_OPTIONS = {
  sideEffects: false,
} as const satisfies AgentContextFromRequestOptions;

export async function requireV2LeadGetContext(
  request: Request,
): Promise<AgentOrgContext | null> {
  return requireAgentContextFromRequest(request, V2_LEAD_GET_AUTH_OPTIONS);
}

export function v2CanAccessLead(
  ctx: AgentOrgContext,
  lead: {
    organizationId: string | null;
    workspaceId?: string | null;
    assignedAgentId: string | null;
  },
): boolean {
  return canAccessLead(ctx, lead);
}
