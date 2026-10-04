import {
  sendEmailVerification,
  VERIFY_EMAIL_NUDGE_KIND,
} from "@/lib/auth/email-verification";
import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import { SITE_URL } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { isConsumerRole } from "@/lib/roles";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";

/** Delay after signup / email change before the automatic Verify your email send. */
export const EMAIL_VERIFY_NUDGE_MS = 24 * 60 * 60 * 1000;
export const EMAIL_VERIFY_NUDGE_BATCH = 40;
/** Claim older than this can be recovered if no automatic-nudge log exists. */
export const EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS = 20 * 60 * 1000;

export const EMAIL_VERIFY_NUDGE_CRON = {
  job: "verify-email-nudge",
  schedule:
    "every ~10 minutes via Sync Mac LaunchAgent (pnpm verify-email-nudge:run)",
} as const;

export { VERIFY_EMAIL_NUDGE_KIND };

export function nextEmailVerifyNudgeDueAt(from: Date): Date {
  return new Date(from.getTime() + EMAIL_VERIFY_NUDGE_MS);
}

export function emailVerifyNudgeStaleBefore(now: Date): Date {
  return new Date(now.getTime() - EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS);
}

export function isFreshNudgeClaim(
  sentAt: Date | null,
  now: Date,
): boolean {
  if (!sentAt) return false;
  return sentAt.getTime() > emailVerifyNudgeStaleBefore(now).getTime();
}

/** Patch applied when the customer's login email actually changes. */
export function emailAddressChangeVerificationPatch(at: Date) {
  return {
    emailVerified: null as Date | null,
    emailVerifyNudgeDueAt: nextEmailVerifyNudgeDueAt(at),
    emailVerifyNudgeSentAt: null as Date | null,
  };
}

export type VerifyEmailNudgeCandidate = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  workspaceId: string | null;
  disabledAt: Date | null;
  emailVerified: Date | null;
  emailVerifyNudgeDueAt: Date | null;
  emailVerifyNudgeSentAt: Date | null;
};

export type VerifyEmailNudgeSkipReason =
  | "ok"
  | "missing"
  | "not_consumer"
  | "disabled"
  | "already_verified"
  | "not_due"
  | "fresh_claim"
  | "no_workspace";

export function evaluateVerifyEmailNudge(
  candidate: VerifyEmailNudgeCandidate | null,
  now: Date,
): { ok: true } | { ok: false; reason: VerifyEmailNudgeSkipReason } {
  if (!candidate) return { ok: false, reason: "missing" };
  if (candidate.disabledAt) return { ok: false, reason: "disabled" };
  if (!isConsumerRole(candidate.role)) {
    return { ok: false, reason: "not_consumer" };
  }
  if (candidate.emailVerified) {
    return { ok: false, reason: "already_verified" };
  }
  if (isFreshNudgeClaim(candidate.emailVerifyNudgeSentAt, now)) {
    return { ok: false, reason: "fresh_claim" };
  }
  if (
    !candidate.emailVerifyNudgeDueAt ||
    candidate.emailVerifyNudgeDueAt.getTime() > now.getTime()
  ) {
    return { ok: false, reason: "not_due" };
  }
  if (!candidate.workspaceId) return { ok: false, reason: "no_workspace" };
  return { ok: true };
}

export type VerifyEmailNudgeStore = {
  listDue(now: Date, take: number): Promise<VerifyEmailNudgeCandidate[]>;
  reload(userId: string): Promise<VerifyEmailNudgeCandidate | null>;
  claimLease(input: {
    userId: string;
    at: Date;
    staleBefore: Date;
  }): Promise<boolean>;
  releaseLease(userId: string): Promise<void>;
  hasAutomaticNudgeDelivery(input: {
    userId: string;
    email: string;
  }): Promise<boolean>;
  resolveOrigin(workspaceId: string): Promise<string>;
  send(input: {
    email: string;
    name: string | null;
    customerId: string;
    workspaceId: string;
    origin: string;
  }): Promise<"sent" | "skipped" | "failed">;
};

function hostnameFromSiteUrl(): string {
  try {
    return new URL(SITE_URL).hostname || "houzzat.com";
  } catch {
    return "houzzat.com";
  }
}

const NUDGE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  workspaceId: true,
  disabledAt: true,
  emailVerified: true,
  emailVerifyNudgeDueAt: true,
  emailVerifyNudgeSentAt: true,
} as const;

export const prismaVerifyEmailNudgeStore: VerifyEmailNudgeStore = {
  listDue(now, take) {
    const staleBefore = emailVerifyNudgeStaleBefore(now);
    return prisma.user.findMany({
      where: {
        emailVerified: null,
        disabledAt: null,
        role: { in: ["BUYER", "SELLER"] },
        workspaceId: { not: null },
        emailVerifyNudgeDueAt: { lte: now },
        OR: [
          { emailVerifyNudgeSentAt: null },
          { emailVerifyNudgeSentAt: { lte: staleBefore } },
        ],
      },
      orderBy: { emailVerifyNudgeDueAt: "asc" },
      take,
      select: NUDGE_SELECT,
    });
  },
  reload(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: NUDGE_SELECT,
    });
  },
  async claimLease(input) {
    const result = await prisma.user.updateMany({
      where: {
        id: input.userId,
        emailVerified: null,
        disabledAt: null,
        OR: [
          { emailVerifyNudgeSentAt: null },
          { emailVerifyNudgeSentAt: { lte: input.staleBefore } },
        ],
      },
      data: { emailVerifyNudgeSentAt: input.at },
    });
    return result.count === 1;
  },
  async releaseLease(userId) {
    await prisma.user.updateMany({
      where: {
        id: userId,
        emailVerified: null,
        emailVerifyNudgeSentAt: { not: null },
      },
      data: { emailVerifyNudgeSentAt: null },
    });
  },
  async hasAutomaticNudgeDelivery(input) {
    const toEmail = normalizeIdentityEmail(input.email);
    const log = await prisma.leadEmailLog.findFirst({
      where: {
        kind: VERIFY_EMAIL_NUDGE_KIND,
        toEmail,
        lead: { customerId: input.userId },
      },
      select: { id: true },
    });
    return Boolean(log);
  },
  resolveOrigin(workspaceId) {
    return resolveCanonicalPublicOrigin(workspaceId, hostnameFromSiteUrl());
  },
  async send(input) {
    return sendEmailVerification({
      email: input.email,
      name: input.name,
      callbackUrl: "/",
      customerId: input.customerId,
      workspaceId: input.workspaceId,
      origin: input.origin,
      purpose: "automatic_nudge",
    });
  },
};

export type VerifyEmailNudgeRunStats = {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
};

async function keepClaimIfDeliveredOrRelease(
  store: VerifyEmailNudgeStore,
  user: { id: string; email: string },
): Promise<boolean> {
  const delivered = await store.hasAutomaticNudgeDelivery({
    userId: user.id,
    email: user.email,
  });
  if (delivered) return true;
  await store.releaseLease(user.id);
  return false;
}

export async function runVerifyEmailNudgeJob(
  store: VerifyEmailNudgeStore = prismaVerifyEmailNudgeStore,
  now: Date = new Date(),
): Promise<VerifyEmailNudgeRunStats> {
  const stats: VerifyEmailNudgeRunStats = {
    checked: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  const staleBefore = emailVerifyNudgeStaleBefore(now);

  const due = await store.listDue(now, EMAIL_VERIFY_NUDGE_BATCH);
  for (const row of due) {
    stats.checked += 1;
    const fresh = await store.reload(row.id);
    const decision = evaluateVerifyEmailNudge(fresh, now);
    if (!decision.ok || !fresh?.workspaceId) {
      stats.skipped += 1;
      continue;
    }

    const alreadyDelivered = await store.hasAutomaticNudgeDelivery({
      userId: fresh.id,
      email: fresh.email,
    });
    if (alreadyDelivered) {
      await store.claimLease({
        userId: fresh.id,
        at: now,
        staleBefore,
      });
      stats.skipped += 1;
      continue;
    }

    const claimed = await store.claimLease({
      userId: fresh.id,
      at: now,
      staleBefore,
    });
    if (!claimed) {
      stats.skipped += 1;
      continue;
    }

    const immediate = await store.reload(fresh.id);
    const stillUnverified = evaluateVerifyEmailNudge(
      immediate
        ? { ...immediate, emailVerifyNudgeSentAt: null }
        : null,
      now,
    );
    if (!stillUnverified.ok || !immediate?.workspaceId) {
      if (immediate && !immediate.emailVerified) {
        await store.releaseLease(immediate.id);
      }
      stats.skipped += 1;
      continue;
    }

    let sendStatus: "sent" | "skipped" | "failed";
    try {
      const origin = await store.resolveOrigin(immediate.workspaceId);
      sendStatus = await store.send({
        email: immediate.email,
        name: immediate.name,
        customerId: immediate.id,
        workspaceId: immediate.workspaceId,
        origin,
      });
    } catch (error) {
      console.error("[verify-email-nudge] send threw", {
        userId: immediate.id,
        error,
      });
      sendStatus = "failed";
    }

    if (sendStatus === "sent") {
      stats.sent += 1;
      continue;
    }

    const delivered = await keepClaimIfDeliveredOrRelease(store, immediate);
    if (delivered) {
      stats.sent += 1;
      continue;
    }

    if (sendStatus === "skipped") {
      stats.skipped += 1;
    } else {
      stats.failed += 1;
    }
  }

  return stats;
}
