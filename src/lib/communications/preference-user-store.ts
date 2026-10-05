import type { PreferenceUserStore } from "@/lib/communications/preference-commands";
import { prisma as defaultPrisma } from "@/lib/prisma";

type UserDb = {
  user: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        email: true;
        workspaceId: true;
        emailAlertsEnabled: true;
        caslConsentAt: true;
      };
    }): Promise<{
      id: string;
      email: string;
      workspaceId: string | null;
      emailAlertsEnabled: boolean;
      caslConsentAt: Date | null;
    } | null>;
    update(args: {
      where: { id: string };
      data: { emailAlertsEnabled: boolean; caslConsentAt?: Date | null };
      select: {
        id: true;
        email: true;
        workspaceId: true;
        emailAlertsEnabled: true;
        caslConsentAt: true;
      };
    }): Promise<{
      id: string;
      email: string;
      workspaceId: string | null;
      emailAlertsEnabled: boolean;
      caslConsentAt: Date | null;
    }>;
  };
};

export function prismaPreferenceUserStore(
  db: UserDb = defaultPrisma,
): PreferenceUserStore {
  return {
    async findById(id) {
      return db.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          workspaceId: true,
          emailAlertsEnabled: true,
          caslConsentAt: true,
        },
      });
    },
    async updateEmailAlertsEnabled(input) {
      return db.user.update({
        where: { id: input.userId },
        data: {
          emailAlertsEnabled: input.emailAlertsEnabled,
          ...(input.caslConsentAt !== undefined
            ? { caslConsentAt: input.caslConsentAt }
            : {}),
        },
        select: {
          id: true,
          email: true,
          workspaceId: true,
          emailAlertsEnabled: true,
          caslConsentAt: true,
        },
      });
    },
  };
}
