import { selectLeadReturnedInactivityBucket } from "@/lib/platform/sms-automations/buckets";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import {
  completedInactiveDays,
  prismaLastCustomerActivityDb,
  resolveLastCustomerActivityAt,
  type LastCustomerActivityDb,
} from "./activity";
import {
  customerIntroductionCycleKey,
  becameFirstValidCustomerE164,
} from "./customer-introduction";
import {
  returnedCycleKey,
  signupCycleKey,
  SMS_AUTOMATION_KEYS,
  SMS_AUTOMATION_RETURN_LEAD_CAP,
  unsubscribeCycleKey,
  viewingCycleKey,
} from "./constants";
import {
  dispatchSmsAutomation,
  prismaSmsAutomationExecuteDb,
  type SmsAutomationExecuteDb,
  type SmsAutomationExecuteDeps,
} from "./execute";

export type SmsAutomationTriggerDeps = SmsAutomationExecuteDeps & {
  db?: SmsAutomationExecuteDb;
  activityDb?: LastCustomerActivityDb;
};

async function safeDispatch(
  db: SmsAutomationExecuteDb,
  input: Parameters<typeof dispatchSmsAutomation>[1],
  deps?: SmsAutomationExecuteDeps,
) {
  try {
    return await dispatchSmsAutomation(db, input, deps);
  } catch (error) {
    console.error("[sms:automation] dispatch failed", {
      key: input.key,
      leadId: input.leadId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "FAILED" as const, reason: "EXCEPTION" };
  }
}

function execDb(deps?: SmsAutomationTriggerDeps) {
  return deps?.db ?? prismaSmsAutomationExecuteDb(prisma);
}

/**
 * Agent-only signup SMS (CRM link). Customer Introduction welcome is delayed
 * until post-qualification active browsing — see welcome-introduction API.
 */
export async function runAgentNewLeadSignupSms(
  leadId: string,
  deps: SmsAutomationTriggerDeps = {},
) {
  const db = execDb(deps);
  await safeDispatch(
    db,
    {
      key: SMS_AUTOMATION_KEYS.agentNewLeadSignup,
      leadId,
      cycleKey: signupCycleKey(),
    },
    deps,
  );
}

/** @deprecated Prefer runAgentNewLeadSignupSms — no longer sends customer welcome. */
export async function runSignupSmsAutomations(
  leadId: string,
  deps: SmsAutomationTriggerDeps = {},
) {
  await runAgentNewLeadSignupSms(leadId, deps);
}

export async function runCustomerIntroductionSmsAutomation(
  leadId: string,
  deps: SmsAutomationTriggerDeps = {},
) {
  const db = execDb(deps);
  await safeDispatch(
    db,
    {
      key: SMS_AUTOMATION_KEYS.leadWelcome,
      leadId,
      cycleKey: customerIntroductionCycleKey(),
    },
    deps,
  );
}

export async function runCustomerIntroductionSmsAutomationsForCustomer(
  customerId: string,
  deps: SmsAutomationTriggerDeps = {},
) {
  const id = customerId.trim();
  if (!id) return;
  const db = execDb(deps);
  const leads = (await db.lead.findMany({
    where: { customerId: id, workspaceId: { not: null } },
    select: { id: true },
    take: SMS_AUTOMATION_RETURN_LEAD_CAP,
  } as never)) as Array<{ id: string }>;
  for (const lead of leads) {
    await runCustomerIntroductionSmsAutomation(lead.id, deps);
  }
}

export function scheduleAgentNewLeadSignupSms(leadId: string): void {
  if (!leadId.trim()) return;
  try {
    scheduleWorkerSideEffect(
      runAgentNewLeadSignupSms(leadId).catch((error) => {
        console.error("[sms:automation] agent new lead signup failed", {
          leadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  } catch (error) {
    console.error("[sms:automation] agent new lead signup schedule failed", {
      leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Agent SMS only — customer welcome is armed after qualification + active browse. */
export function scheduleSignupSmsAutomations(leadId: string): void {
  scheduleAgentNewLeadSignupSms(leadId);
}

export function scheduleCustomerIntroductionSmsAutomationsForLead(
  leadId: string,
): void {
  if (!leadId.trim()) return;
  try {
    scheduleWorkerSideEffect(
      runCustomerIntroductionSmsAutomation(leadId).catch((error) => {
        console.error("[sms:automation] customer introduction failed", {
          leadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  } catch (error) {
    console.error("[sms:automation] customer introduction schedule failed", {
      leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scheduleCustomerIntroductionSmsAutomationsForCustomer(
  customerId: string,
): void {
  if (!customerId.trim()) return;
  try {
    scheduleWorkerSideEffect(
      runCustomerIntroductionSmsAutomationsForCustomer(customerId).catch(
        (error) => {
          console.error("[sms:automation] customer introduction failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        },
      ),
    );
  } catch (error) {
    console.error("[sms:automation] customer introduction schedule failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scheduleCustomerIntroductionIfFirstValidE164(input: {
  customerId: string;
  previousPhone?: string | null;
  previousPhoneE164?: string | null;
  nextPhone?: string | null;
  nextPhoneE164?: string | null;
}): void {
  if (!becameFirstValidCustomerE164(input)) return;
  const customerId = input.customerId.trim();
  if (!customerId) return;
  // Signup funnel: defer Customer Introduction until post-qualification active browse.
  scheduleWorkerSideEffect(
    (async () => {
      const user = await prisma.user.findUnique({
        where: { id: customerId },
        select: {
          qualificationCompletedAt: true,
          leads: {
            where: { source: "SIGNUP" },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (user?.leads[0] && !user.qualificationCompletedAt) {
        console.info(
          "[sms:automation] customer introduction deferred until qualification browse",
          { customerIdPrefix: customerId.slice(0, 8) },
        );
        return;
      }
      await runCustomerIntroductionSmsAutomationsForCustomer(customerId);
    })().catch((error) => {
      console.error("[sms:automation] customer introduction gate failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
}

export async function runUnsubscribeSmsAutomations(
  customerId: string,
  at: Date = new Date(),
  deps: SmsAutomationTriggerDeps = {},
) {
  const db = execDb(deps);
  const leads = (await db.lead.findMany({
    where: { customerId, assignedAgentId: { not: null } },
    select: { id: true },
    take: SMS_AUTOMATION_RETURN_LEAD_CAP,
  } as never)) as Array<{ id: string }>;
  const cycleKey = unsubscribeCycleKey(at);
  for (const lead of leads) {
    await safeDispatch(
      db,
      {
        key: SMS_AUTOMATION_KEYS.agentLeadUnsubscribed,
        leadId: lead.id,
        cycleKey,
      },
      deps,
    );
  }
}

export function scheduleUnsubscribeSmsAutomations(customerId: string): void {
  if (!customerId.trim()) return;
  try {
    scheduleWorkerSideEffect(
      runUnsubscribeSmsAutomations(customerId).catch((error) => {
        console.error("[sms:automation] unsubscribe failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  } catch (error) {
    console.error("[sms:automation] unsubscribe schedule failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runViewingRequestedSmsAutomation(
  leadId: string,
  propertyAddress?: string | null,
  deps: SmsAutomationTriggerDeps = {},
) {
  const db = execDb(deps);
  await safeDispatch(
    db,
    {
      key: SMS_AUTOMATION_KEYS.agentViewingRequested,
      leadId,
      cycleKey: viewingCycleKey(leadId),
      propertyAddress,
    },
    deps,
  );
}

export function scheduleViewingRequestedSmsAutomation(
  leadId: string,
  propertyAddress?: string | null,
): void {
  if (!leadId.trim()) return;
  try {
    scheduleWorkerSideEffect(
      runViewingRequestedSmsAutomation(leadId, propertyAddress).catch(
        (error) => {
          console.error("[sms:automation] viewing failed", {
            leadId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      ),
    );
  } catch (error) {
    console.error("[sms:automation] viewing schedule failed", {
      leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runLeadReturnedSmsAutomations(
  customerId: string,
  previousLastSeenAt: Date | null,
  deps: SmsAutomationTriggerDeps = {},
) {
  const db = execDb(deps);
  const now = deps.now ?? new Date();
  const leads = (await db.lead.findMany({
    where: { customerId, workspaceId: { not: null } },
    select: {
      id: true,
      createdAt: true,
      customerId: true,
    },
    take: SMS_AUTOMATION_RETURN_LEAD_CAP,
  } as never)) as Array<{
    id: string;
    createdAt: Date;
    customerId: string | null;
  }>;
  if (!leads.length) return { sent: 0, bucket: null as number | null };

  const activityDb = deps.activityDb ?? prismaLastCustomerActivityDb(prisma);
  const last =
    previousLastSeenAt ??
    (await resolveLastCustomerActivityAt(activityDb, {
      customerId,
      leadIds: leads.map((row) => row.id),
      createdAt: leads.reduce(
        (min, row) => (row.createdAt < min ? row.createdAt : min),
        leads[0]!.createdAt,
      ),
      before: now,
    }));
  const days = completedInactiveDays(last, now);
  const bucket = selectLeadReturnedInactivityBucket(days);
  if (!bucket) return { sent: 0, bucket: null };

  const cycleKey = returnedCycleKey(bucket, last);
  let sent = 0;
  for (const lead of leads) {
    const agent = await safeDispatch(
      db,
      {
        key: SMS_AUTOMATION_KEYS.agentLeadReturned,
        leadId: lead.id,
        cycleKey,
      },
      deps,
    );
    const welcome = await safeDispatch(
      db,
      {
        key: SMS_AUTOMATION_KEYS.leadReturned,
        leadId: lead.id,
        cycleKey,
      },
      deps,
    );
    if (agent.status === "SENT" || welcome.status === "SENT") sent += 1;
  }
  return { sent, bucket };
}

export function scheduleLeadReturnedSmsAutomations(
  customerId: string,
  previousLastSeenAt: Date | null,
): void {
  if (!customerId.trim()) return;
  try {
    scheduleWorkerSideEffect(
      runLeadReturnedSmsAutomations(customerId, previousLastSeenAt).catch(
        (error) => {
          console.error("[sms:automation] returned failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        },
      ),
    );
  } catch (error) {
    console.error("[sms:automation] returned schedule failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
