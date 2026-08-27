/**
 * Resolve tenant vs platform surface for admin pages (RSC).
 * Fail closed: unknown host or missing membership → null tenant auth.
 */
import { auth } from "@/lib/auth";
import {
  authorizeTenantCommandCentre,
  resolveAdminSurfaceMode,
  type TenantCommandCentreAuth,
} from "@/lib/admin/tenant-command-centre-auth";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";

export type AdminPageSurface =
  | { kind: "tenant"; auth: TenantCommandCentreAuth; request: Request }
  | { kind: "platform"; request: Request | null }
  | { kind: "deny" };

export async function resolveAdminPageSurface(): Promise<AdminPageSurface> {
  const request = await buildSyntheticRequestFromHeaders();
  const hostname = request
    ? extractTrustedRequestHostname(request)
    : null;
  const mode = resolveAdminSurfaceMode(hostname);

  if (mode === "deny") return { kind: "deny" };
  if (mode === "platform") return { kind: "platform", request };

  if (!request) return { kind: "deny" };
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return { kind: "deny" };

  const tenantAuth = await authorizeTenantCommandCentre(request, {
    id: user.id,
    role: user.role ?? "",
  });
  if (!tenantAuth) return { kind: "deny" };
  return { kind: "tenant", auth: tenantAuth, request };
}
