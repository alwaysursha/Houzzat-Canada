/**
 * Stage 3K.5.8G — request-scoped CRM context entry points for pages and APIs.
 */
import { redirect } from "next/navigation";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import {
  requireAgentContext,
  requireAgentContextFromRequest,
  type AgentOrgContext,
} from "@/lib/agent";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";

export async function buildCrmRequestFromHeaders(): Promise<Request | null> {
  return buildSyntheticRequestFromHeaders();
}

export async function requireAgentPageContext(
  callbackPath: string,
): Promise<AgentOrgContext> {
  const request = await buildCrmRequestFromHeaders();
  const ctx = request
    ? await requireAgentContextFromRequest(request)
    : await requireAgentContext();
  if (!ctx) {
    redirect(await staffSignInRedirectUrl(callbackPath));
  }
  return ctx;
}
