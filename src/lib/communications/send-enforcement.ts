import {
  classifyEmailKind,
  isCustomerOptionalEmailCategory,
  isCustomerPolicyExemptClass,
  isOptionalEmailClass,
  type CommunicationCategory,
} from "@/lib/communications/classification";
import { customerCategoryEmailEnabled } from "@/lib/communications/customer-preferences";
import type { CommunicationPreferenceStore } from "@/lib/communications/preference-store";
import { prismaEmailSuppressionStore } from "@/lib/communications/stores";
import {
  lookupEmailSuppression,
  type EmailSuppressionStore,
  type SuppressionLookupStatus,
} from "@/lib/communications/suppression";
import { prisma as defaultPrisma } from "@/lib/prisma";

type WorkspaceLookup = {
  lead: {
    findUnique(args: {
      where: { id: string };
      select: {
        workspaceId: true;
        customer: { select: { workspaceId: true } };
      };
    }): Promise<{
      workspaceId: string | null;
      customer: { workspaceId: string | null } | null;
    } | null>;
  };
  user: {
    findUnique(args: {
      where: { id: string };
      select: { workspaceId: true };
    }): Promise<{ workspaceId: string | null } | null>;
  };
};

/**
 * Resolve tenant from lead/customer identity — never by email address.
 */
export async function resolveEmailSendWorkspace(
  input: { customerId?: string | null; leadId?: string | null },
  db: WorkspaceLookup = defaultPrisma,
): Promise<string | null> {
  if (input.leadId) {
    const lead = await db.lead.findUnique({
      where: { id: input.leadId },
      select: {
        workspaceId: true,
        customer: { select: { workspaceId: true } },
      },
    });
    return lead?.workspaceId ?? lead?.customer?.workspaceId ?? null;
  }
  if (input.customerId) {
    const user = await db.user.findUnique({
      where: { id: input.customerId },
      select: { workspaceId: true },
    });
    return user?.workspaceId ?? null;
  }
  return null;
}

export type OptionalEmailSuppressionDecision = {
  blocked: boolean;
  reason: string;
  lookupStatus: SuppressionLookupStatus | "not_applicable";
};

/**
 * Phase 1 send-time check: suppression only, and only for optional classes.
 * Unknown kinds stay unclassified in the classifier; send compatibility still
 * does not newly block them. Lookup failure is exposed, not treated as clear.
 * Missing workspace → do not guess; preserve current send.
 */
/**
 * Resolve the category used for optional-email preference checks.
 * Callers may supply an authoritative category when a shared template kind
 * (e.g. sold_alert) is used from more than one watch origin.
 */
export function resolveOptionalEmailCategory(input: {
  kind: string;
  category?: CommunicationCategory | null;
}): CommunicationCategory {
  if (input.category) return input.category;
  return classifyEmailKind(input.kind).category;
}

export async function evaluateOptionalEmailSuppression(input: {
  to: string;
  kind: string;
  workspaceId: string | null;
  userId?: string | null;
  /**
   * Authoritative optional-email category when template kind is ambiguous
   * across origins (Property Watch vs Area Watch sold emails).
   */
  category?: CommunicationCategory | null;
  store?: EmailSuppressionStore;
  preferenceStore?: CommunicationPreferenceStore;
}): Promise<OptionalEmailSuppressionDecision> {
  const classified = classifyEmailKind(input.kind);
  if (isCustomerPolicyExemptClass(classified.class)) {
    return {
      blocked: false,
      reason:
        classified.class === "internal"
          ? "internal_exempt"
          : "transactional_exempt",
      lookupStatus: "not_applicable",
    };
  }
  if (!isOptionalEmailClass(classified.class)) {
    return {
      blocked: false,
      reason: "legacy_unclassified_compat",
      lookupStatus: "not_applicable",
    };
  }
  if (!input.workspaceId) {
    return {
      blocked: false,
      reason: "workspace_unknown",
      lookupStatus: "not_applicable",
    };
  }

  const lookup = await lookupEmailSuppression(
    input.store ?? prismaEmailSuppressionStore(),
    {
      workspaceId: input.workspaceId,
      email: input.to,
      userId: input.userId,
    },
  );

  if (lookup.status === "suppressed") {
    return {
      blocked: true,
      reason: "email_suppressed",
      lookupStatus: "suppressed",
    };
  }
  if (lookup.status === "unavailable") {
    console.error("[email:suppression-lookup]", lookup.error);
    return {
      blocked: false,
      reason: "lookup_failed",
      lookupStatus: "unavailable",
    };
  }

  const category = resolveOptionalEmailCategory({
    kind: input.kind,
    category: input.category,
  });

  if (
    input.preferenceStore &&
    input.userId &&
    isCustomerOptionalEmailCategory(category)
  ) {
    try {
      const categoryEnabled = await customerCategoryEmailEnabled({
        store: input.preferenceStore,
        userId: input.userId,
        category,
      });
      if (!categoryEnabled) {
        return {
          blocked: true,
          reason: "category_off",
          lookupStatus: "not_suppressed",
        };
      }
    } catch (error) {
      console.error("[email:category-preference-lookup]", error);
    }
  }

  return {
    blocked: false,
    reason: "allowed",
    lookupStatus: "not_suppressed",
  };
}
