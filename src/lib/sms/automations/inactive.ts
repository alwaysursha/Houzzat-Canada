import { prisma } from "@/lib/prisma";
import {
  completedInactiveDays,
  prismaLastCustomerActivityDb,
  resolveLastCustomerActivityAt,
  type LastCustomerActivityDb,
} from "./activity";
import {
  inactiveCycleKey,
  SMS_AUTOMATION_INACTIVE_BATCH,
  SMS_AUTOMATION_INACTIVE_DAYS,
  SMS_AUTOMATION_INACTIVE_SCAN,
  SMS_AUTOMATION_KEYS,
} from "./constants";
import {
  dispatchSmsAutomation,
  prismaSmsAutomationExecuteDb,
  type SmsAutomationExecuteDb,
  type SmsAutomationExecuteDeps,
} from "./execute";

export type InactiveSmsAutomationDeps = SmsAutomationExecuteDeps & {
  db?: SmsAutomationExecuteDb;
  activityDb?: LastCustomerActivityDb;
  take?: number;
};

type InactiveLeadRow = {
  id: string;
  createdAt: Date;
  customerId: string | null;
  workspaceId: string | null;
};

export async function runInactiveLeadSmsAutomations(
  deps: InactiveSmsAutomationDeps = {},
): Promise<{ scanned: number; sent: number; skipped: number }> {
  const db = deps.db ?? prismaSmsAutomationExecuteDb(prisma);
  const activityDb = deps.activityDb ?? prismaLastCustomerActivityDb(prisma);
  const now = deps.now ?? new Date();
  const sendCap = Math.max(1, deps.take ?? SMS_AUTOMATION_INACTIVE_BATCH);
  const scanCap = Math.max(sendCap, SMS_AUTOMATION_INACTIVE_SCAN);
  const cutoff = new Date(
    now.getTime() - SMS_AUTOMATION_INACTIVE_DAYS * 86_400_000,
  );

  let scanned = 0;
  let sent = 0;
  let skipped = 0;

  while (scanned < scanCap && sent < sendCap) {
    const take = Math.min(SMS_AUTOMATION_INACTIVE_BATCH, scanCap - scanned);
    const leads = (await db.lead.findMany({
      where: {
        workspaceId: { not: null },
        createdAt: { lte: cutoff },
      },
      select: {
        id: true,
        createdAt: true,
        customerId: true,
        workspaceId: true,
      },
      orderBy: { createdAt: "asc" },
      skip: scanned,
      take,
    } as never)) as InactiveLeadRow[];

    if (!leads.length) break;

    for (const lead of leads) {
      if (sent >= sendCap) break;
      if (!lead.workspaceId) {
        skipped += 1;
        continue;
      }
      const last = await resolveLastCustomerActivityAt(activityDb, {
        customerId: lead.customerId,
        leadIds: [lead.id],
        createdAt: lead.createdAt,
        before: now,
      });
      const days = completedInactiveDays(last, now);
      if (days < SMS_AUTOMATION_INACTIVE_DAYS) {
        skipped += 1;
        continue;
      }
      try {
        const result = await dispatchSmsAutomation(
          db,
          {
            key: SMS_AUTOMATION_KEYS.leadInactive14,
            leadId: lead.id,
            cycleKey: inactiveCycleKey(last),
          },
          deps,
        );
        if (result.status === "SENT") sent += 1;
        else skipped += 1;
      } catch (error) {
        skipped += 1;
        console.error("[sms:automation] inactive failed", {
          error: error instanceof Error ? error.name : "ERROR",
        });
      }
    }

    scanned += leads.length;
    if (leads.length < take) break;
  }

  return { scanned, sent, skipped };
}
