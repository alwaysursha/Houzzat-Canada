import { NextResponse } from "next/server";
import {
  SMS_AUTOMATION_CRON,
  runInactiveLeadSmsAutomations,
} from "@/lib/sms/automations";
import {
  beginSmsAutomationCronRun,
  endSmsAutomationCronRun,
  summarizeSmsAutomationCronError,
} from "@/lib/sms/automations/cron-lock";

function authorizeSmsAutomationCron(request: Request): boolean {
  const secret =
    process.env.SMS_AUTOMATION_CRON_SECRET?.trim() ||
    process.env.MONITOR_CRON_SECRET?.trim() ||
    process.env.DIGEST_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.MLS_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-sms-automation-cron-secret");
  const monitorHeader = request.headers.get("x-monitor-cron-secret");
  const digestHeader = request.headers.get("x-digest-cron-secret");
  const auth = request.headers.get("authorization");
  if (header && header === secret) return true;
  if (monitorHeader && monitorHeader === secret) return true;
  if (digestHeader && digestHeader === secret) return true;
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

function cronLog(event: string, fields: Record<string, string | number | boolean>) {
  console.info(`[sms:automation:cron] ${event}`, fields);
}

export async function POST(request: Request) {
  if (!authorizeSmsAutomationCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!beginSmsAutomationCronRun()) {
    cronLog("overlap", { job: SMS_AUTOMATION_CRON.job });
    return NextResponse.json({
      ok: true,
      job: SMS_AUTOMATION_CRON.job,
      skipped: true,
      reason: "OVERLAP",
    });
  }

  const started = Date.now();
  try {
    const result = await runInactiveLeadSmsAutomations();
    const durationMs = Date.now() - started;
    cronLog("complete", {
      job: SMS_AUTOMATION_CRON.job,
      scanned: result.scanned,
      sent: result.sent,
      skipped: result.skipped,
      durationMs,
    });
    return NextResponse.json({
      ok: true,
      job: SMS_AUTOMATION_CRON.job,
      durationMs,
      ...result,
    });
  } catch (error) {
    cronLog("failed", {
      job: SMS_AUTOMATION_CRON.job,
      error: summarizeSmsAutomationCronError(error),
      durationMs: Date.now() - started,
    });
    return NextResponse.json(
      { ok: false, job: SMS_AUTOMATION_CRON.job, error: "EXCEPTION" },
      { status: 500 },
    );
  } finally {
    endSmsAutomationCronRun();
  }
}

export async function GET(request: Request) {
  if (!authorizeSmsAutomationCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    job: SMS_AUTOMATION_CRON.job,
    schedule: SMS_AUTOMATION_CRON.schedule,
  });
}
