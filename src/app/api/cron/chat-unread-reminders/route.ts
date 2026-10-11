import { NextResponse } from "next/server";
import {
  authorizeChatUnreadReminderCronRequest,
  CHAT_UNREAD_REMINDER_CRON,
  runChatUnreadReminderCron,
  type ChatUnreadReminderCronDb,
} from "@/lib/conversations/agent-unread-reminder-cron";
import {
  beginChatUnreadReminderCronRun,
  endChatUnreadReminderCronRun,
  summarizeChatUnreadReminderCronError,
} from "@/lib/conversations/agent-unread-reminder-cron-lock";
import { prisma } from "@/lib/prisma";

/**
 * Interactive claim (advisory lock + FOR UPDATE) requires a transaction-capable
 * Prisma path: Node + Neon WS (default), or workerd via prisma.$transaction
 * one-shot WS proxy. Do not force PRISMA_NEON_ADAPTER=http for this job.
 */
export const runtime = "nodejs";

function cronLog(
  event: string,
  fields: Record<string, string | number | boolean>,
) {
  console.info(`[chat:unread-reminder:cron] ${event}`, fields);
}

export async function POST(request: Request) {
  if (!authorizeChatUnreadReminderCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!beginChatUnreadReminderCronRun()) {
    cronLog("overlap", { job: CHAT_UNREAD_REMINDER_CRON.job });
    return NextResponse.json({
      ok: true,
      job: CHAT_UNREAD_REMINDER_CRON.job,
      skipped: true,
      reason: "OVERLAP",
    });
  }

  const started = Date.now();
  try {
    const result = await runChatUnreadReminderCron({
      db: prisma as unknown as ChatUnreadReminderCronDb,
    });
    const durationMs = Date.now() - started;
    cronLog("complete", {
      job: CHAT_UNREAD_REMINDER_CRON.job,
      candidatesScanned: result.candidatesScanned,
      eligibleClaims: result.eligibleClaims,
      remindersAttempted: result.remindersAttempted,
      remindersSent: result.remindersSent,
      skipped: result.skipped,
      errors: result.errors,
      durationMs,
    });
    return NextResponse.json({
      ok: true,
      durationMs,
      ...result,
    });
  } catch (error) {
    cronLog("failed", {
      job: CHAT_UNREAD_REMINDER_CRON.job,
      error: summarizeChatUnreadReminderCronError(error),
      durationMs: Date.now() - started,
    });
    return NextResponse.json(
      { ok: false, job: CHAT_UNREAD_REMINDER_CRON.job, error: "EXCEPTION" },
      { status: 500 },
    );
  } finally {
    endChatUnreadReminderCronRun();
  }
}

export async function GET(request: Request) {
  if (!authorizeChatUnreadReminderCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    job: CHAT_UNREAD_REMINDER_CRON.job,
    schedule: CHAT_UNREAD_REMINDER_CRON.schedule,
  });
}
