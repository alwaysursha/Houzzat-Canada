/**
 * Phase 3C — meaningful customer watch/search/global-email CRM history.
 * Preference toggles stay out of LeadActivity; removals + global OFF/ON only.
 */
import type { Prisma } from "@prisma/client";
import {
  logLeadActivityForCustomer,
  type LeadActivityCustomerDb,
  type LogLeadActivityForCustomerResult,
} from "@/lib/agent/log-contact-activity";

export const PROPERTY_WATCH_REMOVED = "property_watch_removed" as const;
export const AREA_WATCH_REMOVED = "area_watch_removed" as const;
export const SAVED_SEARCH_REMOVED = "saved_search_removed" as const;

export type GlobalOptionalEmailCrmTransition = {
  userId: string;
  workspaceId: string;
  previousEnabled: boolean;
  nextEnabled: boolean;
  source: string;
};

/** Actual emailAlertsEnabled transition only — not idempotent re-posts. */
export function shouldLogGlobalOptionalEmailCrmActivity(input: {
  previousEnabled: boolean;
  nextEnabled: boolean;
}): boolean {
  return input.previousEnabled !== input.nextEnabled;
}

export async function logPropertyWatchRemovedActivity(
  input: {
    customerId: string;
    workspaceId: string | null | undefined;
    mlsNumber: string;
    source?: string;
    actorUserId?: string | null;
  },
  db?: LeadActivityCustomerDb,
): Promise<LogLeadActivityForCustomerResult> {
  return logLeadActivityForCustomer(
    {
      customerId: input.customerId,
      workspaceId: input.workspaceId,
      type: PROPERTY_WATCH_REMOVED,
      body: "Customer stopped watching a property",
      actorUserId: input.actorUserId ?? input.customerId,
      meta: {
        mlsNumber: input.mlsNumber,
        source: input.source ?? "account_property_monitors",
        action: "delete",
      } satisfies Prisma.InputJsonValue,
    },
    db,
  );
}

export async function logAreaWatchRemovedActivity(
  input: {
    customerId: string;
    workspaceId: string | null | undefined;
    areaMonitorId: string;
    city: string;
    community: string | null;
    transactionType: string;
    segment: string | null;
    name?: string | null;
    source?: string;
    actorUserId?: string | null;
  },
  db?: LeadActivityCustomerDb,
): Promise<LogLeadActivityForCustomerResult> {
  return logLeadActivityForCustomer(
    {
      customerId: input.customerId,
      workspaceId: input.workspaceId,
      type: AREA_WATCH_REMOVED,
      body: "Customer stopped watching an area",
      actorUserId: input.actorUserId ?? input.customerId,
      meta: {
        areaMonitorId: input.areaMonitorId,
        city: input.city,
        community: input.community,
        transactionType: input.transactionType,
        segment: input.segment,
        ...(input.name ? { name: input.name } : {}),
        source: input.source ?? "account_area_monitors",
        action: "delete",
      } satisfies Prisma.InputJsonValue,
    },
    db,
  );
}

export async function logSavedSearchRemovedActivity(
  input: {
    customerId: string;
    workspaceId: string | null | undefined;
    savedSearchId: string;
    name: string;
    isPrimary: boolean;
    summary?: string | null;
    source?: string;
    actorUserId?: string | null;
  },
  db?: LeadActivityCustomerDb,
): Promise<LogLeadActivityForCustomerResult> {
  return logLeadActivityForCustomer(
    {
      customerId: input.customerId,
      workspaceId: input.workspaceId,
      type: SAVED_SEARCH_REMOVED,
      body: "Customer deleted a saved search",
      actorUserId: input.actorUserId ?? input.customerId,
      meta: {
        savedSearchId: input.savedSearchId,
        name: input.name,
        isPrimary: input.isPrimary,
        ...(input.summary ? { summary: input.summary } : {}),
        source: input.source ?? "saved_searches",
        action: "delete",
      } satisfies Prisma.InputJsonValue,
    },
    db,
  );
}

/**
 * Post-success CRM side effect for global optional email transitions.
 * Best-effort: never throws to callers (mutation already committed).
 */
export async function logGlobalOptionalEmailCrmActivityBestEffort(
  input: GlobalOptionalEmailCrmTransition,
  db?: LeadActivityCustomerDb,
): Promise<LogLeadActivityForCustomerResult & { skipped: boolean }> {
  if (
    !shouldLogGlobalOptionalEmailCrmActivity({
      previousEnabled: input.previousEnabled,
      nextEnabled: input.nextEnabled,
    })
  ) {
    return { written: 0, workspaceId: input.workspaceId, skipped: true };
  }

  try {
    if (input.nextEnabled === false) {
      const result = await logLeadActivityForCustomer(
        {
          customerId: input.userId,
          workspaceId: input.workspaceId,
          type: "unsubscribe",
          body: "Customer turned off email alerts",
          actorUserId: input.userId,
          meta: {
            channel: "email",
            source: input.source,
            action: "global_optional_email_off",
          },
        },
        db,
      );
      return { ...result, skipped: false };
    }

    const result = await logLeadActivityForCustomer(
      {
        customerId: input.userId,
        workspaceId: input.workspaceId,
        type: "contact_updated_by_customer",
        body: "Customer re-enabled email alerts",
        actorUserId: input.userId,
        meta: {
          channel: "email",
          source: input.source,
          action: "global_optional_email_on",
        },
      },
      db,
    );
    return { ...result, skipped: false };
  } catch (error) {
    console.error("[crm:global-optional-email]", error);
    return { written: 0, workspaceId: input.workspaceId, skipped: false };
  }
}

/** Best-effort wrappers for delete paths — never fail the customer mutation. */
export async function logPropertyWatchRemovedBestEffort(
  input: Parameters<typeof logPropertyWatchRemovedActivity>[0],
  db?: LeadActivityCustomerDb,
) {
  try {
    return await logPropertyWatchRemovedActivity(input, db);
  } catch (error) {
    console.error("[crm:property-watch-removed]", error);
    return { written: 0, workspaceId: input.workspaceId ?? null };
  }
}

export async function logAreaWatchRemovedBestEffort(
  input: Parameters<typeof logAreaWatchRemovedActivity>[0],
  db?: LeadActivityCustomerDb,
) {
  try {
    return await logAreaWatchRemovedActivity(input, db);
  } catch (error) {
    console.error("[crm:area-watch-removed]", error);
    return { written: 0, workspaceId: input.workspaceId ?? null };
  }
}

export async function logSavedSearchRemovedBestEffort(
  input: Parameters<typeof logSavedSearchRemovedActivity>[0],
  db?: LeadActivityCustomerDb,
) {
  try {
    return await logSavedSearchRemovedActivity(input, db);
  } catch (error) {
    console.error("[crm:saved-search-removed]", error);
    return { written: 0, workspaceId: input.workspaceId ?? null };
  }
}
