import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

/** CRM rows the signed-in customer may see on the current tenant site. */
export function customerWorkspaceLeadWhere(
  customerId: string,
  workspaceId: string,
) {
  return { customerId, workspaceId };
}

export function customerWorkspaceAppointmentWhere(
  customerId: string,
  workspaceId: string,
) {
  return { customerId, lead: { workspaceId } };
}

export function customerWorkspaceActivityWhere(
  customerId: string,
  workspaceId: string,
) {
  return { lead: { customerId, workspaceId } };
}

export async function resolveAccountWorkspaceId(): Promise<string | null> {
  const request = await buildSyntheticRequestFromHeaders();
  if (!request) return null;
  const tenancy = await resolveRequestTenancy(request);
  return tenancy.ok ? tenancy.workspaceId : null;
}
