/**
 * Stage 3K.3 — trusted hostname → workspace resolution types.
 */
import type {
  WorkspaceDomainKind,
  WorkspaceDomainRole,
} from "@prisma/client";

export type HostResolutionDenyReason =
  | "malformed_hostname"
  | "platform_surface"
  | "domain_not_found"
  | "domain_inactive"
  | "workspace_inactive";

export type ResolvedWorkspaceHostSuccess = {
  ok: true;
  mode: "legacy" | "workspace";
  workspaceId: string;
  workspaceSlug: string;
  normalizedHostname: string;
  domainKind?: WorkspaceDomainKind;
  domainRole?: WorkspaceDomainRole;
  /** True only when hostname tenancy was verified via ACTIVE WorkspaceDomain row. */
  verifiedHostname: boolean;
};

export type ResolvedWorkspaceHostFailure = {
  ok: false;
  mode: "workspace";
  normalizedHostname: string | null;
  reason: HostResolutionDenyReason;
  verifiedHostname: false;
};

export type ResolvedWorkspaceHost =
  | ResolvedWorkspaceHostSuccess
  | ResolvedWorkspaceHostFailure;

/** Future middleware/layout consumption — no orgId, branding, or client workspaceId. */
export type ResolvedWorkspaceHostContext = Pick<
  ResolvedWorkspaceHostSuccess,
  | "workspaceId"
  | "workspaceSlug"
  | "normalizedHostname"
  | "domainKind"
  | "domainRole"
  | "verifiedHostname"
> & {
  mode: ResolvedWorkspaceHostSuccess["mode"];
};

export function toResolvedWorkspaceHostContext(
  result: ResolvedWorkspaceHost,
): ResolvedWorkspaceHostContext | null {
  if (!result.ok) return null;
  return {
    mode: result.mode,
    workspaceId: result.workspaceId,
    workspaceSlug: result.workspaceSlug,
    normalizedHostname: result.normalizedHostname,
    domainKind: result.domainKind,
    domainRole: result.domainRole,
    verifiedHostname: result.verifiedHostname,
  };
}
