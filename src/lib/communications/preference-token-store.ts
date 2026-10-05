import type { CommunicationPreferenceTokenPurpose as PrismaPurpose } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  PREFERENCE_TOKEN_TTL_MS,
  createPreferenceRawToken,
  hashPreferenceToken,
} from "@/lib/communications/preference-token-crypto";
import type {
  CommunicationPreferenceTokenPurpose,
  CommunicationPreferenceTokenRecord,
  CommunicationPreferenceTokenStore,
} from "@/lib/communications/preference-token-types";

function toPrismaPurpose(
  purpose: CommunicationPreferenceTokenPurpose,
): PrismaPurpose {
  switch (purpose) {
    case "manage":
      return "MANAGE";
    case "one_click":
      return "ONE_CLICK";
    default: {
      const _never: never = purpose;
      return _never;
    }
  }
}

function fromPrismaPurpose(
  purpose: PrismaPurpose,
): CommunicationPreferenceTokenPurpose {
  switch (purpose) {
    case "MANAGE":
      return "manage";
    case "ONE_CLICK":
      return "one_click";
    default: {
      const _never: never = purpose;
      return _never;
    }
  }
}

function toRecord(row: {
  id: string;
  tokenHash: string;
  purpose: PrismaPurpose;
  userId: string;
  workspaceId: string;
  emailNormalized: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  source: string;
}): CommunicationPreferenceTokenRecord {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    purpose: fromPrismaPurpose(row.purpose),
    userId: row.userId,
    workspaceId: row.workspaceId,
    emailNormalized: row.emailNormalized,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    source: row.source,
  };
}

export function prismaCommunicationPreferenceTokenStore(
  db: typeof defaultPrisma = defaultPrisma,
): CommunicationPreferenceTokenStore {
  return {
    async findByHash(tokenHash) {
      const row = await db.communicationPreferenceToken.findUnique({
        where: { tokenHash },
      });
      return row ? toRecord(row) : null;
    },
    async create(record) {
      const row = await db.communicationPreferenceToken.create({
        data: {
          tokenHash: record.tokenHash,
          purpose: toPrismaPurpose(record.purpose),
          userId: record.userId,
          workspaceId: record.workspaceId,
          emailNormalized: record.emailNormalized,
          expiresAt: record.expiresAt,
          revokedAt: record.revokedAt ?? null,
          lastUsedAt: record.lastUsedAt ?? null,
          source: record.source,
        },
      });
      return toRecord(row);
    },
    async revokeById(id, at) {
      await db.communicationPreferenceToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: at },
      });
    },
    async revokeActiveForUser(input) {
      const result = await db.communicationPreferenceToken.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: input.at },
      });
      return result.count;
    },
    async deleteExpiredForUser(input) {
      const result = await db.communicationPreferenceToken.deleteMany({
        where: {
          userId: input.userId,
          expiresAt: { lte: input.now },
        },
      });
      return result.count;
    },
    async touchLastUsed(id, at) {
      await db.communicationPreferenceToken.update({
        where: { id },
        data: { lastUsedAt: at },
      });
    },
  };
}

export function memoryCommunicationPreferenceTokenStore(): CommunicationPreferenceTokenStore & {
  rows: CommunicationPreferenceTokenRecord[];
} {
  const rows: CommunicationPreferenceTokenRecord[] = [];
  return {
    rows,
    async findByHash(tokenHash) {
      return rows.find((row) => row.tokenHash === tokenHash) ?? null;
    },
    async create(record) {
      const row: CommunicationPreferenceTokenRecord = {
        tokenHash: record.tokenHash,
        purpose: record.purpose,
        userId: record.userId,
        workspaceId: record.workspaceId,
        emailNormalized: record.emailNormalized,
        expiresAt: record.expiresAt,
        source: record.source,
        id:
          record.id ??
          `cpt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        revokedAt: record.revokedAt ?? null,
        lastUsedAt: record.lastUsedAt ?? null,
      };
      rows.push(row);
      return row;
    },
    async revokeById(id, at) {
      const row = rows.find((item) => item.id === id);
      if (row && row.revokedAt == null) row.revokedAt = at;
    },
    async revokeActiveForUser(input) {
      let count = 0;
      for (const row of rows) {
        if (row.userId === input.userId && row.revokedAt == null) {
          row.revokedAt = input.at;
          count += 1;
        }
      }
      return count;
    },
    async deleteExpiredForUser(input) {
      const remaining: CommunicationPreferenceTokenRecord[] = [];
      let count = 0;
      for (const row of rows) {
        if (
          row.userId === input.userId &&
          row.expiresAt.getTime() <= input.now.getTime()
        ) {
          count += 1;
          continue;
        }
        remaining.push(row);
      }
      rows.splice(0, rows.length, ...remaining);
      return count;
    },
    async touchLastUsed(id, at) {
      const row = rows.find((item) => item.id === id);
      if (row) row.lastUsedAt = at;
    },
  };
}

export function mintPreferenceTokenRecord(input: {
  purpose: CommunicationPreferenceTokenPurpose;
  userId: string;
  workspaceId: string;
  emailNormalized: string;
  source: string;
  now?: Date;
  ttlMs?: number;
  rawToken?: string;
}): {
  record: Omit<CommunicationPreferenceTokenRecord, "id"> & { id?: string };
  rawToken: string;
} {
  const now = input.now ?? new Date();
  const rawToken = input.rawToken ?? createPreferenceRawToken();
  const record = {
    tokenHash: hashPreferenceToken(rawToken),
    purpose: input.purpose,
    userId: input.userId,
    workspaceId: input.workspaceId,
    emailNormalized: input.emailNormalized,
    expiresAt: new Date(now.getTime() + (input.ttlMs ?? PREFERENCE_TOKEN_TTL_MS)),
    revokedAt: null,
    lastUsedAt: null,
    source: input.source,
  };
  return { record, rawToken };
}
