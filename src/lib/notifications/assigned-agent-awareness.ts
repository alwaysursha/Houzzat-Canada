/**
 * Phase 4 — assigned-agent awareness for meaningful customer Watch / Saved
 * Search / global-email-off actions.
 *
 * Not an inbox. HouzzatPRO FCM + staff email (global OFF only).
 * Recipient is always current Lead.assignedAgentId in the trusted workspace.
 * Never accepts a recipient agent id from the browser.
 */
import { openLeadHandoffHref } from "@/lib/agent/lead-profile-query";
import { SITE_URL } from "@/lib/constants";
import { renderCustomerAlertOffStaffEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/notifications";
import {
  isPushTypeEnabled,
  type StaffPushType,
} from "@/lib/notifications/catalog";
import { isStaffEmailCategoryEnabled } from "@/lib/notifications/staff-categories";
import {
  deliverPushToUsersNow,
  type PushDeliveryResult,
  type PushPayload,
} from "@/lib/notifications/push";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { isAgentRole } from "@/lib/roles";
import { authorizeStaffRecipientForLead } from "@/lib/workspace-notification-recipients";

export const CUSTOMER_ALERT_CHANGE_PUSH_TYPE =
  "customer_alert_change" satisfies StaffPushType;
export const CUSTOMER_ALERT_CHANGES_EMAIL_CATEGORY =
  "customer_alert_changes" as const;

export const ASSIGNED_AGENT_AWARENESS_EVENTS = [
  "property_watch_removed",
  "area_watch_removed",
  "saved_search_removed",
  "global_email_off",
] as const;

export type AssignedAgentAwarenessEvent =
  (typeof ASSIGNED_AGENT_AWARENESS_EVENTS)[number];

const ID_PREFIX_LEN = 8;

export function awarenessIdPrefix(id: string): string {
  return id.slice(0, ID_PREFIX_LEN);
}

export function isGlobalEmailOffAwarenessTransition(input: {
  previousEnabled: boolean;
  nextEnabled: boolean;
}): boolean {
  return input.previousEnabled === true && input.nextEnabled === false;
}

/** Never use an email address as the lock-screen / push display name. */
export function safeCustomerDisplayName(
  name: string | null | undefined,
): string {
  const trimmed = name?.replace(/\s+/g, " ").trim() ?? "";
  if (!trimmed || trimmed.includes("@")) return "A client";
  return trimmed;
}

export function firstNameForAwareness(
  name: string | null | undefined,
): string {
  const display = safeCustomerDisplayName(name);
  if (display === "A client") return display;
  const first = display.split(" ")[0]?.trim() ?? "";
  return first || "A client";
}

export function areaWatchAwarenessLabel(input: {
  city: string;
  community?: string | null;
}): string {
  const city = input.city.replace(/\s+/g, " ").trim();
  const community = input.community?.replace(/\s+/g, " ").trim() ?? "";
  if (city && community) return `${city} · ${community}`;
  return city || community || "an area";
}

export type AssignedAgentAwarenessInput = {
  customerId: string;
  workspaceId: string;
  event: AssignedAgentAwarenessEvent;
  /** Optional safe snapshot already on the mutation — never looked up from MLS. */
  propertyLabel?: string | null;
  areaLabel?: string | null;
  savedSearchName?: string | null;
};

export type AssignedAgentAwarenessSkipReason =
  | "missing_workspace"
  | "missing_customer"
  | "workspace_mismatch"
  | "no_lead"
  | "unassigned"
  | "unauthorized"
  | "disabled_agent"
  | "inactive_agent"
  | "not_staff"
  | "push_pref_off"
  | "email_pref_off"
  | "no_staff_email"
  | "no_channels";

export type AssignedAgentAwarenessResult = {
  attempted: { push: boolean; email: boolean };
  skipped?: AssignedAgentAwarenessSkipReason;
  leadId?: string;
  recipientUserId?: string;
};

export type AssignedAgentAwarenessCustomer = {
  id: string;
  workspaceId: string | null;
  name: string | null;
};

export type AssignedAgentAwarenessLead = {
  id: string;
  workspaceId: string | null;
  customerId: string | null;
  assignedAgentId: string | null;
};

export type AssignedAgentAwarenessAssignee = {
  id: string;
  email: string | null;
  disabledAt: Date | null;
  role: string;
  pushNotificationPrefs: unknown;
  agentProfile: { active: boolean } | null;
};

export type AssignedAgentAwarenessDeps = {
  loadCustomer?: (
    customerId: string,
  ) => Promise<AssignedAgentAwarenessCustomer | null>;
  loadLead?: (input: {
    customerId: string;
    workspaceId: string;
  }) => Promise<AssignedAgentAwarenessLead | null>;
  loadAssignee?: (
    userId: string,
  ) => Promise<AssignedAgentAwarenessAssignee | null>;
  authorizeStaffRecipientForLead?: typeof authorizeStaffRecipientForLead;
  recipientInWorkspace?: (input: {
    workspaceId: string;
    userId: string;
  }) => Promise<boolean>;
  deliverPushToUsersNow?: typeof deliverPushToUsersNow;
  sendNotification?: typeof sendNotification;
  scheduleWorkerSideEffect?: typeof scheduleWorkerSideEffect;
};

function defaultLoadCustomer(
  customerId: string,
): Promise<AssignedAgentAwarenessCustomer | null> {
  return prisma.user.findUnique({
    where: { id: customerId },
    select: { id: true, workspaceId: true, name: true },
  });
}

function defaultLoadLead(input: {
  customerId: string;
  workspaceId: string;
}): Promise<AssignedAgentAwarenessLead | null> {
  return prisma.lead.findFirst({
    where: {
      customerId: input.customerId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      customerId: true,
      assignedAgentId: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

function defaultLoadAssignee(
  userId: string,
): Promise<AssignedAgentAwarenessAssignee | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      disabledAt: true,
      role: true,
      pushNotificationPrefs: true,
      agentProfile: { select: { active: true } },
    },
  });
}

async function defaultRecipientInWorkspace(input: {
  workspaceId: string;
  userId: string;
}): Promise<boolean> {
  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return Boolean(member);
}

function absoluteLeadCrmUrl(leadId: string): string {
  const path = openLeadHandoffHref(leadId);
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

export function buildAssignedAgentAwarenessPushPayload(input: {
  event: AssignedAgentAwarenessEvent;
  firstName: string;
  leadId: string;
  propertyLabel?: string | null;
  areaLabel?: string | null;
  savedSearchName?: string | null;
}): PushPayload {
  const href = openLeadHandoffHref(input.leadId);
  switch (input.event) {
    case "property_watch_removed": {
      const label = input.propertyLabel?.replace(/\s+/g, " ").trim() ?? "";
      return {
        type: CUSTOMER_ALERT_CHANGE_PUSH_TYPE,
        title: `${input.firstName} stopped watching a property`,
        body: label || "A Property Watch was stopped.",
        href,
      };
    }
    case "area_watch_removed": {
      const area = input.areaLabel?.replace(/\s+/g, " ").trim() || "an area";
      return {
        type: CUSTOMER_ALERT_CHANGE_PUSH_TYPE,
        title: `${input.firstName} stopped watching ${area}`,
        body: "An Area Watch was stopped.",
        href,
      };
    }
    case "saved_search_removed": {
      const name = input.savedSearchName?.replace(/\s+/g, " ").trim() ?? "";
      return {
        type: CUSTOMER_ALERT_CHANGE_PUSH_TYPE,
        title: `${input.firstName} deleted a saved search`,
        body: name || "A Saved Search was deleted.",
        href,
      };
    }
    case "global_email_off":
      return {
        type: CUSTOMER_ALERT_CHANGE_PUSH_TYPE,
        title: `${input.firstName} turned off email alerts`,
        body: "This customer will no longer receive optional listing and alert emails.",
        href,
      };
    default: {
      const exhaustive: never = input.event;
      return exhaustive;
    }
  }
}

function awarenessEmailEligible(
  event: AssignedAgentAwarenessEvent,
): boolean {
  return event === "global_email_off";
}

function skipLog(
  event: AssignedAgentAwarenessEvent,
  reason: AssignedAgentAwarenessSkipReason,
  extra: Record<string, string | number | boolean | null | undefined>,
): void {
  console.info(`[staff-notify] ${event} skipped: ${reason}`, extra);
}

function formatPushResultLog(
  event: AssignedAgentAwarenessEvent,
  userId: string,
  result: Pick<PushDeliveryResult, "status">,
): string {
  return `[staff-notify] ${event} push userPrefix=${awarenessIdPrefix(userId)} status=${result.status}`;
}

/**
 * Resolve assigned agent in the trusted workspace and deliver awareness.
 * Never throws to callers. Does not write CRM rows.
 */
export async function notifyAssignedAgentAwareness(
  input: AssignedAgentAwarenessInput,
  deps: AssignedAgentAwarenessDeps = {},
): Promise<AssignedAgentAwarenessResult> {
  const attempted = { push: false, email: false };
  const event = input.event;
  try {
    const workspaceId = input.workspaceId?.trim() ?? "";
    const customerId = input.customerId?.trim() ?? "";
    if (!workspaceId || !customerId) {
      skipLog(event, "missing_workspace", {});
      return { attempted, skipped: "missing_workspace" };
    }

    const loadCustomer = deps.loadCustomer ?? defaultLoadCustomer;
    const customer = await loadCustomer(customerId);
    if (!customer) {
      skipLog(event, "missing_customer", {
        customerPrefix: awarenessIdPrefix(customerId),
      });
      return { attempted, skipped: "missing_customer" };
    }
    if (!customer.workspaceId || customer.workspaceId !== workspaceId) {
      skipLog(event, "workspace_mismatch", {
        customerPrefix: awarenessIdPrefix(customerId),
        workspacePrefix: awarenessIdPrefix(workspaceId),
      });
      return { attempted, skipped: "workspace_mismatch" };
    }

    const loadLead = deps.loadLead ?? defaultLoadLead;
    const lead = await loadLead({ customerId, workspaceId });
    if (
      !lead ||
      lead.workspaceId !== workspaceId ||
      lead.customerId !== customerId
    ) {
      skipLog(event, "no_lead", {
        customerPrefix: awarenessIdPrefix(customerId),
        workspacePrefix: awarenessIdPrefix(workspaceId),
      });
      return { attempted, skipped: "no_lead" };
    }

    const agentId = lead.assignedAgentId;
    if (!agentId) {
      skipLog(event, "unassigned", {
        leadPrefix: awarenessIdPrefix(lead.id),
      });
      return { attempted, skipped: "unassigned", leadId: lead.id };
    }

    const inWorkspace =
      deps.recipientInWorkspace ?? defaultRecipientInWorkspace;
    const memberOk = await inWorkspace({ workspaceId, userId: agentId });
    if (!memberOk) {
      skipLog(event, "unauthorized", {
        leadPrefix: awarenessIdPrefix(lead.id),
        recipientPrefix: awarenessIdPrefix(agentId),
      });
      return {
        attempted,
        skipped: "unauthorized",
        leadId: lead.id,
        recipientUserId: agentId,
      };
    }

    const authorize =
      deps.authorizeStaffRecipientForLead ?? authorizeStaffRecipientForLead;
    const authorized = await authorize({
      userId: agentId,
      leadId: lead.id,
      event,
    });
    if (!authorized) {
      skipLog(event, "unauthorized", {
        leadPrefix: awarenessIdPrefix(lead.id),
        recipientPrefix: awarenessIdPrefix(agentId),
      });
      return {
        attempted,
        skipped: "unauthorized",
        leadId: lead.id,
        recipientUserId: agentId,
      };
    }

    const loadAssignee = deps.loadAssignee ?? defaultLoadAssignee;
    const assignee = await loadAssignee(agentId);
    if (!assignee || assignee.disabledAt) {
      skipLog(event, "disabled_agent", {
        leadPrefix: awarenessIdPrefix(lead.id),
        recipientPrefix: awarenessIdPrefix(agentId),
      });
      return {
        attempted,
        skipped: "disabled_agent",
        leadId: lead.id,
        recipientUserId: agentId,
      };
    }
    if (assignee.agentProfile && assignee.agentProfile.active === false) {
      skipLog(event, "inactive_agent", {
        leadPrefix: awarenessIdPrefix(lead.id),
        recipientPrefix: awarenessIdPrefix(agentId),
      });
      return {
        attempted,
        skipped: "inactive_agent",
        leadId: lead.id,
        recipientUserId: agentId,
      };
    }
    if (!isAgentRole(assignee.role)) {
      skipLog(event, "not_staff", {
        leadPrefix: awarenessIdPrefix(lead.id),
        recipientPrefix: awarenessIdPrefix(agentId),
      });
      return {
        attempted,
        skipped: "not_staff",
        leadId: lead.id,
        recipientUserId: agentId,
      };
    }

    const firstName = firstNameForAwareness(customer.name);
    const payload = buildAssignedAgentAwarenessPushPayload({
      event,
      firstName,
      leadId: lead.id,
      propertyLabel: input.propertyLabel,
      areaLabel: input.areaLabel,
      savedSearchName: input.savedSearchName,
    });

    const pushOn = isPushTypeEnabled(
      assignee.pushNotificationPrefs,
      CUSTOMER_ALERT_CHANGE_PUSH_TYPE,
    );
    const emailOn =
      awarenessEmailEligible(event) &&
      isStaffEmailCategoryEnabled(
        assignee.pushNotificationPrefs,
        CUSTOMER_ALERT_CHANGES_EMAIL_CATEGORY,
      );

    if (!pushOn && !emailOn) {
      const reason: AssignedAgentAwarenessSkipReason = awarenessEmailEligible(
        event,
      )
        ? "no_channels"
        : "push_pref_off";
      skipLog(event, reason, {
        leadPrefix: awarenessIdPrefix(lead.id),
        recipientPrefix: awarenessIdPrefix(agentId),
      });
      return {
        attempted,
        skipped: reason,
        leadId: lead.id,
        recipientUserId: agentId,
      };
    }

    console.info(
      `[staff-notify] ${event} enqueue leadPrefix=${awarenessIdPrefix(lead.id)} recipientPrefix=${awarenessIdPrefix(agentId)} workspacePrefix=${awarenessIdPrefix(workspaceId)}`,
    );

    if (pushOn) {
      attempted.push = true;
      try {
        const deliver = deps.deliverPushToUsersNow ?? deliverPushToUsersNow;
        const results = await deliver([agentId], payload);
        const row = results[0];
        console.info(
          formatPushResultLog(
            event,
            agentId,
            row ?? { status: "no_device" },
          ),
        );
      } catch (error) {
        console.error(`[staff-notify] ${event} push failed`, {
          leadPrefix: awarenessIdPrefix(lead.id),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      skipLog(event, "push_pref_off", {
        leadPrefix: awarenessIdPrefix(lead.id),
        recipientPrefix: awarenessIdPrefix(agentId),
      });
    }

    if (awarenessEmailEligible(event)) {
      if (!emailOn) {
        skipLog(event, "email_pref_off", {
          leadPrefix: awarenessIdPrefix(lead.id),
          recipientPrefix: awarenessIdPrefix(agentId),
        });
      } else {
        const toEmail = assignee.email?.trim() || "";
        if (!toEmail) {
          skipLog(event, "no_staff_email", {
            leadPrefix: awarenessIdPrefix(lead.id),
            recipientPrefix: awarenessIdPrefix(agentId),
          });
        } else {
          attempted.email = true;
          const rendered = renderCustomerAlertOffStaffEmail({
            clientLabel: firstName,
            leadUrl: absoluteLeadCrmUrl(lead.id),
          });
          try {
            const notify = deps.sendNotification ?? sendNotification;
            const result = await notify({
              toEmail,
              subject: rendered.subject,
              text: rendered.text,
              html: rendered.html,
              workspaceId,
            });
            console.info(`[staff-notify] ${event} email status=${result.email}`, {
              leadPrefix: awarenessIdPrefix(lead.id),
              recipientPrefix: awarenessIdPrefix(agentId),
            });
          } catch (error) {
            console.error(`[staff-notify] ${event} email failed`, {
              leadPrefix: awarenessIdPrefix(lead.id),
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    return {
      attempted,
      leadId: lead.id,
      recipientUserId: agentId,
    };
  } catch (error) {
    console.error(`[staff-notify] ${event} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return { attempted };
  }
}

/**
 * Best-effort schedule. Returns immediately. Call only after a successful
 * owned delete or an actual global-email ON→OFF CAS.
 */
export function scheduleAssignedAgentAwareness(
  input: AssignedAgentAwarenessInput,
  deps: AssignedAgentAwarenessDeps = {},
): void {
  try {
    const schedule =
      deps.scheduleWorkerSideEffect ?? scheduleWorkerSideEffect;
    schedule(
      notifyAssignedAgentAwareness(input, deps).catch((error) => {
        console.error(`[staff-notify] ${input.event} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  } catch (error) {
    console.error(`[staff-notify] ${input.event} schedule failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
