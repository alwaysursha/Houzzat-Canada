import { logGlobalOptionalEmailCrmActivityBestEffort } from "@/lib/agent/customer-alert-crm-activity";
import { prisma } from "@/lib/prisma";
import type {
  CanonicalGlobalStores,
  PreferenceCommandContext,
} from "@/lib/communications/preference-commands";
import { prismaCommunicationPreferenceStore } from "@/lib/communications/preference-store";
import { prismaPreferenceUserStore } from "@/lib/communications/preference-user-store";
import {
  prismaEmailSuppressionStore,
  prismaPreferenceAuditStore,
} from "@/lib/communications/stores";
import {
  isGlobalEmailOffAwarenessTransition,
  scheduleAssignedAgentAwareness,
} from "@/lib/notifications/assigned-agent-awareness";

export function prismaPreferenceCommandContext(): PreferenceCommandContext {
  return {
    userStore: prismaPreferenceUserStore(),
    preferenceStore: prismaCommunicationPreferenceStore(),
    suppressionStore: prismaEmailSuppressionStore(),
    auditStore: prismaPreferenceAuditStore(),
    async runCanonicalTransaction(work) {
      return prisma.$transaction(async (tx) => {
        const stores: CanonicalGlobalStores = {
          userStore: prismaPreferenceUserStore(tx),
          suppressionStore: prismaEmailSuppressionStore(tx),
          auditStore: prismaPreferenceAuditStore(tx),
        };
        return work(stores);
      });
    },
    async onGlobalOptionalEmailTransition(event) {
      await logGlobalOptionalEmailCrmActivityBestEffort(event);
    },
    async onAssignedAgentAwareness(event) {
      if (
        !isGlobalEmailOffAwarenessTransition({
          previousEnabled: event.previousEnabled,
          nextEnabled: event.nextEnabled,
        })
      ) {
        return;
      }
      scheduleAssignedAgentAwareness({
        customerId: event.userId,
        workspaceId: event.workspaceId,
        event: "global_email_off",
      });
    },
  };
}
