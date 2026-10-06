import type { PreferenceUserStore } from "@/lib/communications/preference-commands";
import { prisma as defaultPrisma } from "@/lib/prisma";

const userSelect = {
  id: true,
  email: true,
  workspaceId: true,
  emailAlertsEnabled: true,
  caslConsentAt: true,
} as const;

type UserRow = {
  id: string;
  email: string;
  workspaceId: string | null;
  emailAlertsEnabled: boolean;
  caslConsentAt: Date | null;
};

type UserDb = {
  user: {
    findUnique(args: {
      where: { id: string };
      select: typeof userSelect;
    }): Promise<UserRow | null>;
    updateMany(args: {
      where: { id: string; emailAlertsEnabled: boolean };
      data: { emailAlertsEnabled: boolean; caslConsentAt?: Date | null };
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: { caslConsentAt?: Date | null };
      select: typeof userSelect;
    }): Promise<UserRow>;
  };
};

export function prismaPreferenceUserStore(
  db: UserDb = defaultPrisma,
): PreferenceUserStore {
  return {
    async findById(id) {
      return db.user.findUnique({
        where: { id },
        select: userSelect,
      });
    },
    async applyEmailAlertsEnabled(input) {
      const current = await db.user.findUnique({
        where: { id: input.userId },
        select: userSelect,
      });
      if (!current) {
        throw new Error("user_not_found");
      }

      const previousEnabled = current.emailAlertsEnabled;
      if (previousEnabled === input.emailAlertsEnabled) {
        if (input.caslConsentAt !== undefined) {
          const next = await db.user.update({
            where: { id: input.userId },
            data: { caslConsentAt: input.caslConsentAt },
            select: userSelect,
          });
          return { ...next, previousEnabled, changed: false };
        }
        return { ...current, previousEnabled, changed: false };
      }

      const swapped = await db.user.updateMany({
        where: {
          id: input.userId,
          emailAlertsEnabled: previousEnabled,
        },
        data: {
          emailAlertsEnabled: input.emailAlertsEnabled,
          ...(input.caslConsentAt !== undefined
            ? { caslConsentAt: input.caslConsentAt }
            : {}),
        },
      });
      if (swapped.count === 0) {
        const latest = await db.user.findUnique({
          where: { id: input.userId },
          select: userSelect,
        });
        if (!latest) throw new Error("user_not_found");
        return {
          ...latest,
          previousEnabled: latest.emailAlertsEnabled,
          changed: false,
        };
      }

      const next = await db.user.findUnique({
        where: { id: input.userId },
        select: userSelect,
      });
      if (!next) throw new Error("user_not_found");
      return { ...next, previousEnabled, changed: true };
    },
  };
}
