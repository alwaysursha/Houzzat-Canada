import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import {
  isCustomerOptionalEmailCategory,
  type CommunicationCategory,
  type CommunicationChannel,
} from "@/lib/communications/classification";
import {
  getCustomerCommunicationPreferences,
  type CustomerCommunicationPreferences,
} from "@/lib/communications/customer-preferences";
import {
  buildPreferenceAuditRecord,
  recordCommunicationPreferenceEvent,
  type CommunicationPreferenceAuditStore,
} from "@/lib/communications/preference-audit";
import type { CommunicationPreferenceStore } from "@/lib/communications/preference-store";
import {
  applyEmailSuppression,
  deactivateCustomerGlobalUnsubscribe,
  findCustomerEmailSuppression,
  lookupEmailSuppression,
  type EmailSuppressionStore,
} from "@/lib/communications/suppression";

export type PreferenceCommandError =
  | "user_not_found"
  | "workspace_mismatch"
  | "workspace_required"
  | "invalid_category"
  | "invalid_channel"
  | "push_not_managed";

export type PreferenceUserRecord = {
  id: string;
  email: string;
  workspaceId: string | null;
  emailAlertsEnabled: boolean;
  caslConsentAt: Date | null;
};

export type PreferenceUserStore = {
  findById(id: string): Promise<PreferenceUserRecord | null>;
  updateEmailAlertsEnabled(input: {
    userId: string;
    emailAlertsEnabled: boolean;
    caslConsentAt?: Date | null;
  }): Promise<PreferenceUserRecord>;
};

export type CanonicalGlobalStores = {
  userStore: PreferenceUserStore;
  suppressionStore: EmailSuppressionStore;
  auditStore: CommunicationPreferenceAuditStore;
};

export type PreferenceCommandContext = {
  userStore: PreferenceUserStore;
  preferenceStore: CommunicationPreferenceStore;
  suppressionStore: EmailSuppressionStore;
  auditStore: CommunicationPreferenceAuditStore;
  runCanonicalTransaction<T>(
    work: (stores: CanonicalGlobalStores) => Promise<T>,
  ): Promise<T>;
};

function workspaceOk(
  user: PreferenceUserRecord,
  workspaceId: string,
): boolean {
  return Boolean(user.workspaceId) && user.workspaceId === workspaceId;
}

export async function setCategoryEmailPreference(
  ctx: PreferenceCommandContext,
  input: {
    userId: string;
    workspaceId: string;
    category: string;
    channel: string;
    enabled: boolean;
    source: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<
  | { ok: true; preferences: CustomerCommunicationPreferences }
  | { ok: false; error: PreferenceCommandError }
> {
  if (input.channel !== "email") {
    return { ok: false, error: "push_not_managed" };
  }
  const channel: CommunicationChannel = "email";
  if (!isCustomerOptionalEmailCategory(input.category as CommunicationCategory)) {
    return { ok: false, error: "invalid_category" };
  }
  const category = input.category as CommunicationCategory;
  const user = await ctx.userStore.findById(input.userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (!input.workspaceId.trim()) return { ok: false, error: "workspace_required" };
  if (!workspaceOk(user, input.workspaceId)) {
    return { ok: false, error: "workspace_mismatch" };
  }

  const previous = await ctx.preferenceStore.findOne({
    userId: user.id,
    category,
    channel,
  });

  await ctx.preferenceStore.upsert({
    userId: user.id,
    workspaceId: input.workspaceId,
    category,
    channel,
    enabled: input.enabled,
  });

  await recordCommunicationPreferenceEvent(
    ctx.auditStore,
    buildPreferenceAuditRecord({
      workspaceId: input.workspaceId,
      userId: user.id,
      emailNormalized: normalizeIdentityEmail(user.email),
      kind: input.enabled
        ? "preference_category_on"
        : "preference_category_off",
      category,
      channel,
      previousState: {
        explicit: previous != null,
        enabled: previous?.enabled ?? null,
      },
      resultingState: { explicit: true, enabled: input.enabled },
      source: input.source,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    }),
  );

  const preferences = await getCustomerCommunicationPreferences({
    userId: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    emailAlertsEnabled: user.emailAlertsEnabled,
    preferenceStore: ctx.preferenceStore,
    suppressionStore: ctx.suppressionStore,
  });
  return { ok: true, preferences };
}

export type GlobalOptionalEmailResult = {
  previousEnabled: boolean;
  nextEnabled: boolean;
  customerUnsubscribed: boolean;
  customerUnsubscribeChanged: boolean;
  mailboxStillSuppressed: boolean;
  audited: boolean;
};

/**
 * Canonical global optional-email mutation.
 * OFF: emailAlertsEnabled=false + CUSTOMER/GLOBAL_UNSUBSCRIBE.
 * ON: emailAlertsEnabled=true + remove only CUSTOMER/GLOBAL_UNSUBSCRIBE.
 * Never invents CASL consent. Never touches mailbox, categories, or entities.
 */
export async function setGlobalOptionalEmailPreference(
  ctx: PreferenceCommandContext,
  input: {
    userId: string;
    workspaceId: string;
    enabled: boolean;
    source: string;
    caslConsentAt?: Date | null;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<
  | { ok: true } & GlobalOptionalEmailResult
  | { ok: false; error: PreferenceCommandError }
> {
  const user = await ctx.userStore.findById(input.userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (!input.workspaceId.trim()) return { ok: false, error: "workspace_required" };
  if (!workspaceOk(user, input.workspaceId)) {
    return { ok: false, error: "workspace_mismatch" };
  }

  try {
    return await ctx.runCanonicalTransaction(async (stores) => {
      const previousEnabled = user.emailAlertsEnabled;
      const beforeCustomer = await findCustomerEmailSuppression(
        stores.suppressionStore,
        { workspaceId: input.workspaceId, userId: user.id },
      );
      const hadCustomerUnsubscribe =
        beforeCustomer?.reason === "GLOBAL_UNSUBSCRIBE";

      const next = await stores.userStore.updateEmailAlertsEnabled({
        userId: user.id,
        emailAlertsEnabled: input.enabled,
        ...(input.caslConsentAt !== undefined
          ? { caslConsentAt: input.caslConsentAt }
          : {}),
      });

      let customerUnsubscribed = hadCustomerUnsubscribe;
      let customerUnsubscribeChanged = false;

      if (input.enabled) {
        const cleared = await deactivateCustomerGlobalUnsubscribe(
          stores.suppressionStore,
          { workspaceId: input.workspaceId, userId: user.id },
        );
        customerUnsubscribed = false;
        customerUnsubscribeChanged = cleared.removed;
      } else {
        const suppression = await applyEmailSuppression(stores.suppressionStore, {
          workspaceId: input.workspaceId,
          userId: user.id,
          emailNormalized: user.email,
          reason: "GLOBAL_UNSUBSCRIBE",
          source: input.source,
          providerId: null,
          leadEmailLogId: null,
          meta: { action: "set_global_optional_email", enabled: false },
        });
        customerUnsubscribed = true;
        customerUnsubscribeChanged =
          suppression.created || !hadCustomerUnsubscribe;
      }

      const afterLookup = await lookupEmailSuppression(stores.suppressionStore, {
        workspaceId: input.workspaceId,
        email: user.email,
        userId: user.id,
      });
      const mailboxStillSuppressed =
        afterLookup.status === "suppressed" &&
        afterLookup.matchedScope === "MAILBOX";

      const changed =
        previousEnabled !== next.emailAlertsEnabled ||
        customerUnsubscribeChanged;

      if (changed) {
        await recordCommunicationPreferenceEvent(
          stores.auditStore,
          buildPreferenceAuditRecord({
            workspaceId: input.workspaceId,
            userId: user.id,
            emailNormalized: normalizeIdentityEmail(user.email),
            kind: input.enabled
              ? "preference_global_email_on"
              : "preference_global_email_off",
            category: null,
            channel: "email",
            previousState: {
              emailAlertsEnabled: previousEnabled,
              customerUnsubscribed: hadCustomerUnsubscribe,
            },
            resultingState: {
              emailAlertsEnabled: next.emailAlertsEnabled,
              customerUnsubscribed,
              mailboxStillSuppressed,
            },
            source: input.source,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
          }),
        );
      }

      return {
        ok: true as const,
        previousEnabled,
        nextEnabled: next.emailAlertsEnabled,
        customerUnsubscribed,
        customerUnsubscribeChanged,
        mailboxStillSuppressed,
        audited: changed,
      };
    });
  } catch (error) {
    console.error("[communications:global-optional-email]", error);
    throw error;
  }
}

export async function unsubscribeAllOptionalEmail(
  ctx: PreferenceCommandContext,
  input: {
    userId: string;
    workspaceId: string;
    source: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<
  | { ok: true } & GlobalOptionalEmailResult
  | { ok: false; error: PreferenceCommandError }
> {
  return setGlobalOptionalEmailPreference(ctx, {
    ...input,
    enabled: false,
  });
}

export async function resubscribeOptionalEmail(
  ctx: PreferenceCommandContext,
  input: {
    userId: string;
    workspaceId: string;
    source: string;
    caslConsentAt?: Date | null;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<
  | { ok: true } & GlobalOptionalEmailResult
  | { ok: false; error: PreferenceCommandError }
> {
  return setGlobalOptionalEmailPreference(ctx, {
    ...input,
    enabled: true,
  });
}
