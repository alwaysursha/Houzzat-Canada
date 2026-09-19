import { prisma } from "@/lib/prisma";
import { isE164, normalizeToE164 } from "@/lib/sms/e164";

export type SmsSuppressionDb = {
  smsSuppression: {
    findUnique: (args: {
      where: {
        workspaceId_phoneE164: { workspaceId: string; phoneE164: string };
      };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
    upsert: (args: {
      where: {
        workspaceId_phoneE164: { workspaceId: string; phoneE164: string };
      };
      create: {
        workspaceId: string;
        phoneE164: string;
        keyword?: string | null;
        source?: string | null;
      };
      update: {
        suppressedAt: Date;
        keyword?: string | null;
        source?: string | null;
      };
    }) => Promise<unknown>;
    deleteMany: (args: {
      where: { workspaceId: string; phoneE164: string };
    }) => Promise<{ count: number }>;
  };
};

function defaultDb(): SmsSuppressionDb {
  return prisma as unknown as SmsSuppressionDb;
}

/**
 * Workspace-scoped STOP check. Same E.164 in another tenant is independent.
 */
export async function isPhoneSuppressed(
  workspaceId: string | null | undefined,
  phoneE164: string | null | undefined,
  db: SmsSuppressionDb = defaultDb(),
): Promise<boolean> {
  if (!workspaceId || !isE164(phoneE164)) return false;
  const row = await db.smsSuppression.findUnique({
    where: {
      workspaceId_phoneE164: { workspaceId, phoneE164 },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function suppressPhone(
  input: {
    workspaceId: string;
    phoneE164: string;
    keyword?: string | null;
    source?: string | null;
  },
  db: SmsSuppressionDb = defaultDb(),
): Promise<"ok" | "invalid_phone"> {
  const phoneE164 = normalizeToE164(input.phoneE164);
  if (!phoneE164) return "invalid_phone";
  const now = new Date();
  await db.smsSuppression.upsert({
    where: {
      workspaceId_phoneE164: {
        workspaceId: input.workspaceId,
        phoneE164,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      phoneE164,
      keyword: input.keyword ?? null,
      source: input.source ?? null,
    },
    update: {
      suppressedAt: now,
      keyword: input.keyword ?? null,
      source: input.source ?? null,
    },
  });
  return "ok";
}

export async function clearPhoneSuppression(
  input: {
    workspaceId: string;
    phoneE164: string;
  },
  db: SmsSuppressionDb = defaultDb(),
): Promise<"cleared" | "already_clear" | "invalid_phone"> {
  const phoneE164 = normalizeToE164(input.phoneE164);
  if (!phoneE164 || !input.workspaceId.trim()) return "invalid_phone";
  const result = await db.smsSuppression.deleteMany({
    where: {
      workspaceId: input.workspaceId.trim(),
      phoneE164,
    },
  });
  return result.count > 0 ? "cleared" : "already_clear";
}
