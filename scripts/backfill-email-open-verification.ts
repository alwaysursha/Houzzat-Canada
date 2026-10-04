/**
 * One-time historical email-open → canonical User.emailVerified backfill.
 *
 *   pnpm exec tsx scripts/backfill-email-open-verification.ts --dry-run
 *   pnpm exec tsx scripts/backfill-email-open-verification.ts --apply
 *
 * Uses evaluateEmailOpenAutoVerify + applyEmailOpenAutoVerify only.
 * Does not send email.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

import {
  applyEmailOpenAutoVerify,
  evaluateEmailOpenAutoVerify,
  prismaEmailOpenVerifyStore,
  type EmailOpenAutoVerifyCustomer,
} from "../src/lib/auth/email-open-verification";
import { prisma } from "../src/lib/prisma";

type QualifyingRow = {
  userId: string;
  name: string | null;
  email: string;
  leadId: string;
  emailLogId: string;
  providerId: string;
  openedAt: string;
};

function parseMode(): "dry-run" | "apply" {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (dry === apply) {
    throw new Error("Pass exactly one of --dry-run or --apply");
  }
  return dry ? "dry-run" : "apply";
}

async function findQualifyingRows(): Promise<QualifyingRow[]> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["BUYER", "SELLER"] },
      disabledAt: null,
      emailVerified: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      disabledAt: true,
      workspaceId: true,
      emailVerified: true,
    },
  });

  const rows: QualifyingRow[] = [];
  for (const user of users) {
    const customer: EmailOpenAutoVerifyCustomer = user;
    const logs = await prisma.leadEmailLog.findMany({
      where: {
        openedAt: { not: null },
        lead: { customerId: user.id },
      },
      orderBy: { openedAt: "asc" },
      select: {
        id: true,
        leadId: true,
        toEmail: true,
        workspaceId: true,
        providerId: true,
        openedAt: true,
        lead: { select: { customerId: true, workspaceId: true } },
      },
    });

    for (const log of logs) {
      if (!log.openedAt) continue;
      const decision = evaluateEmailOpenAutoVerify({
        log: {
          id: log.id,
          leadId: log.leadId,
          toEmail: log.toEmail,
          workspaceId: log.workspaceId,
          leadWorkspaceId: log.lead.workspaceId,
          customerId: log.lead.customerId,
        },
        customer,
      });
      if (!decision.ok) continue;
      rows.push({
        userId: user.id,
        name: user.name,
        email: user.email,
        leadId: log.leadId,
        emailLogId: log.id,
        providerId: log.providerId ?? log.id,
        openedAt: log.openedAt.toISOString(),
      });
      break;
    }
  }
  return rows;
}

async function main() {
  const mode = parseMode();
  const rows = await findQualifyingRows();
  console.log(JSON.stringify({ mode, count: rows.length, rows }, null, 2));

  if (mode === "dry-run") return;

  const results: Array<{ userId: string; email: string; result: string }> = [];
  for (const row of rows) {
    const customer = await prisma.user.findUnique({
      where: { id: row.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        disabledAt: true,
        workspaceId: true,
        emailVerified: true,
      },
    });
    const log = await prisma.leadEmailLog.findUnique({
      where: { id: row.emailLogId },
      select: {
        id: true,
        leadId: true,
        toEmail: true,
        workspaceId: true,
        providerId: true,
        openedAt: true,
        lead: { select: { customerId: true, workspaceId: true } },
      },
    });
    if (!log?.openedAt) {
      results.push({ userId: row.userId, email: row.email, result: "skipped" });
      continue;
    }
    const result = await applyEmailOpenAutoVerify(prismaEmailOpenVerifyStore, {
      log: {
        id: log.id,
        leadId: log.leadId,
        toEmail: log.toEmail,
        workspaceId: log.workspaceId,
        leadWorkspaceId: log.lead.workspaceId,
        customerId: log.lead.customerId,
      },
      customer,
      providerId: log.providerId ?? log.id,
      at: log.openedAt,
    });
    results.push({ userId: row.userId, email: row.email, result });
  }
  console.log(JSON.stringify({ applied: results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
