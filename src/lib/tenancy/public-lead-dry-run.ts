/**
 * Stage 3K.5.7 — zero-side-effect public lead routing planner (tests only).
 */
import type { LeadIntent } from "@prisma/client";
import {
  PublicLeadRoutingError,
  resolveWorkspaceModeLeadDeskAssignment,
  resolveTrustedPublicLeadWorkspaceId,
  type ResolvedPublicLeadDesk,
  type WorkspaceLeadDeskFixture,
} from "@/lib/workspace-lead-desk";
import type { HostResolutionDeps } from "@/lib/tenancy/resolve-workspace-host";
import {
  resolveLeadNotificationBrandFromDesk,
  type LeadNotificationBrand,
} from "@/lib/tenancy/lead-notification-brand";
import { isTenantPublicLeadScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";
import { resolveDefaultWorkspaceIdForRouting } from "@/lib/workspace-routing";
import {
  resolveOrganizationIdForAssignee,
  resolvePublicLeadDesk,
} from "@/lib/agent";
import { resolveRoutedAssignee } from "@/lib/agent/lead-intake";

export type PublicLeadPathId =
  | "listing-inquiry"
  | "home-valuation"
  | "signup"
  | "affordability-tool"
  | "seller-readiness"
  | "route-planner-request"
  | "pre-construction-inquiry";

export type PublicLeadDryRunResult =
  | {
      ok: true;
      mode: "workspace" | "legacy";
      host: string;
      path: PublicLeadPathId;
      intent: LeadIntent;
      desk: ResolvedPublicLeadDesk;
      brand: LeadNotificationBrand;
      sideEffects: {
        workspaceId: string | null;
        organizationId: string | null;
        assigneeId: string | null;
        emailRecipientIds: string[];
        pushRecipientIds: string[];
        taskAssigneeId: string | null;
        notificationDisplayName: string;
      };
    }
  | {
      ok: false;
      mode: "workspace" | "legacy";
      host: string;
      path: PublicLeadPathId;
      reason: string;
      failure?: PublicLeadRoutingError["reason"];
    };

export async function planPublicLeadRouting(input: {
  host: string;
  path: PublicLeadPathId;
  intent?: LeadIntent;
  fixture?: WorkspaceLeadDeskFixture;
  deps?: HostResolutionDeps;
}): Promise<PublicLeadDryRunResult> {
  const intent = input.intent ?? defaultIntentForPath(input.path);
  const request = new Request(`https://${input.host}/`, {
    headers: { host: input.host, "x-forwarded-proto": "https" },
  });

  if (isTenantPublicLeadScopeWorkspace()) {
    const workspaceId = await resolveTrustedPublicLeadWorkspaceId(
      request,
      input.deps,
    );
    if (!workspaceId) {
      return {
        ok: false,
        mode: "workspace",
        host: input.host,
        path: input.path,
        reason: "workspace_not_resolved",
        failure: "workspace_not_resolved",
      };
    }
    try {
      const desk = await resolveWorkspaceModeLeadDeskAssignment({
        workspaceId,
        intent,
        fixture: input.fixture,
      });
      const brand = resolveLeadNotificationBrandFromDesk({
        workspaceSlug: desk.workspaceSlug,
        displayName:
          desk.workspaceSlug === "tenant-canary"
            ? "Tenant Canary"
            : desk.isHouzzatWorkspace
              ? "Houzzat"
              : null,
      });
      const pushRecipientIds = desk.assigneeId ? [desk.assigneeId] : [];
      return {
        ok: true,
        mode: "workspace",
        host: input.host,
        path: input.path,
        intent,
        desk,
        brand,
        sideEffects: {
          workspaceId: desk.workspaceId,
          organizationId: desk.organizationId,
          assigneeId: desk.assigneeId,
          emailRecipientIds: pushRecipientIds,
          pushRecipientIds,
          taskAssigneeId: desk.assigneeId,
          notificationDisplayName: brand.displayName,
        },
      };
    } catch (error) {
      if (error instanceof PublicLeadRoutingError) {
        return {
          ok: false,
          mode: "workspace",
          host: input.host,
          path: input.path,
          reason: error.message,
          failure: error.reason,
        };
      }
      throw error;
    }
  }

  const legacyWorkspaceId = await resolveDefaultWorkspaceIdForRouting();
  const assigneeId = await resolveRoutedAssignee(intent, legacyWorkspaceId);
  const organizationId =
    (await resolveOrganizationIdForAssignee(assigneeId, legacyWorkspaceId)) ??
    (await resolvePublicLeadDesk(request)).organizationId;
  const brand = resolveLeadNotificationBrandFromDesk({
    workspaceSlug: "houzzat",
    displayName: "Houzzat",
  });
  return {
    ok: true,
    mode: "legacy",
    host: input.host,
    path: input.path,
    intent,
    desk: {
      workspaceId: legacyWorkspaceId,
      organizationId,
      assigneeId,
      workspaceSlug: "houzzat",
      isHouzzatWorkspace: true,
    },
    brand,
    sideEffects: {
      workspaceId: legacyWorkspaceId,
      organizationId,
      assigneeId,
      emailRecipientIds: assigneeId ? [assigneeId] : [],
      pushRecipientIds: assigneeId ? [assigneeId] : [],
      taskAssigneeId: assigneeId,
      notificationDisplayName: brand.displayName,
    },
  };
}

function defaultIntentForPath(path: PublicLeadPathId): LeadIntent {
  switch (path) {
    case "home-valuation":
    case "seller-readiness":
      return "SELLER";
    case "listing-inquiry":
    case "signup":
    case "affordability-tool":
    case "route-planner-request":
    case "pre-construction-inquiry":
      return "BUYER";
    default: {
      const _exhaustive: never = path;
      return _exhaustive;
    }
  }
}
