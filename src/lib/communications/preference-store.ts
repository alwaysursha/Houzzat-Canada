import type {
  CommunicationCategory as PrismaCommunicationCategory,
  CommunicationChannel as PrismaCommunicationChannel,
} from "@prisma/client";
import type {
  CommunicationCategory,
  CommunicationChannel,
} from "@/lib/communications/classification";
import {
  fromPrismaCommunicationCategory,
  fromPrismaCommunicationChannel,
  toPrismaCommunicationCategory,
  toPrismaCommunicationChannel,
} from "@/lib/communications/category-map";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type CommunicationPreferenceRow = {
  userId: string;
  workspaceId: string;
  category: CommunicationCategory;
  channel: CommunicationChannel;
  enabled: boolean;
};

export type CommunicationPreferenceStore = {
  findByUser(userId: string): Promise<CommunicationPreferenceRow[]>;
  findOne(input: {
    userId: string;
    category: CommunicationCategory;
    channel: CommunicationChannel;
  }): Promise<CommunicationPreferenceRow | null>;
  upsert(row: CommunicationPreferenceRow): Promise<CommunicationPreferenceRow>;
};

type PrismaPrefRow = {
  userId: string;
  workspaceId: string;
  category: PrismaCommunicationCategory;
  channel: PrismaCommunicationChannel;
  enabled: boolean;
};

type PrefDb = {
  communicationPreference: {
    findMany(args: {
      where: { userId: string };
    }): Promise<PrismaPrefRow[]>;
    findUnique(args: {
      where: {
        userId_category_channel: {
          userId: string;
          category: PrismaCommunicationCategory;
          channel: PrismaCommunicationChannel;
        };
      };
    }): Promise<PrismaPrefRow | null>;
    upsert(args: {
      where: {
        userId_category_channel: {
          userId: string;
          category: PrismaCommunicationCategory;
          channel: PrismaCommunicationChannel;
        };
      };
      create: {
        userId: string;
        workspaceId: string;
        category: PrismaCommunicationCategory;
        channel: PrismaCommunicationChannel;
        enabled: boolean;
      };
      update: {
        enabled: boolean;
        workspaceId: string;
      };
    }): Promise<PrismaPrefRow>;
  };
};

function fromRow(row: PrismaPrefRow): CommunicationPreferenceRow {
  return {
    userId: row.userId,
    workspaceId: row.workspaceId,
    category: fromPrismaCommunicationCategory(row.category),
    channel: fromPrismaCommunicationChannel(row.channel),
    enabled: row.enabled,
  };
}

export function prismaCommunicationPreferenceStore(
  db: PrefDb = defaultPrisma,
): CommunicationPreferenceStore {
  return {
    async findByUser(userId) {
      const rows = await db.communicationPreference.findMany({
        where: { userId },
      });
      return rows.map(fromRow);
    },
    async findOne({ userId, category, channel }) {
      const prismaCategory = toPrismaCommunicationCategory(category);
      if (!prismaCategory) return null;
      const row = await db.communicationPreference.findUnique({
        where: {
          userId_category_channel: {
            userId,
            category: prismaCategory,
            channel: toPrismaCommunicationChannel(channel),
          },
        },
      });
      return row ? fromRow(row) : null;
    },
    async upsert(row) {
      const prismaCategory = toPrismaCommunicationCategory(row.category);
      if (!prismaCategory) {
        throw new Error(`Cannot persist category ${row.category}`);
      }
      const saved = await db.communicationPreference.upsert({
        where: {
          userId_category_channel: {
            userId: row.userId,
            category: prismaCategory,
            channel: toPrismaCommunicationChannel(row.channel),
          },
        },
        create: {
          userId: row.userId,
          workspaceId: row.workspaceId,
          category: prismaCategory,
          channel: toPrismaCommunicationChannel(row.channel),
          enabled: row.enabled,
        },
        update: {
          enabled: row.enabled,
          workspaceId: row.workspaceId,
        },
      });
      return fromRow(saved);
    },
  };
}

export function memoryCommunicationPreferenceStore(): CommunicationPreferenceStore & {
  rows: CommunicationPreferenceRow[];
} {
  const rows: CommunicationPreferenceRow[] = [];
  return {
    rows,
    async findByUser(userId) {
      return rows.filter((row) => row.userId === userId);
    },
    async findOne({ userId, category, channel }) {
      return (
        rows.find(
          (row) =>
            row.userId === userId &&
            row.category === category &&
            row.channel === channel,
        ) ?? null
      );
    },
    async upsert(row) {
      const index = rows.findIndex(
        (existing) =>
          existing.userId === row.userId &&
          existing.category === row.category &&
          existing.channel === row.channel,
      );
      if (index === -1) {
        rows.push(row);
        return row;
      }
      rows[index] = row;
      return row;
    },
  };
}
