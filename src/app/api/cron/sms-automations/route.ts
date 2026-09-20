import { NextResponse } from "next/server";
import { runInactiveLeadSmsAutomations } from "@/lib/sms/automations";

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

export async function POST(request: Request) {
  if (!authorizeSmsAutomationCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runInactiveLeadSmsAutomations();
  return NextResponse.json({ ok: true, job: "sms-automations-inactive", ...result });
}

export async function GET(request: Request) {
  if (!authorizeSmsAutomationCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    job: "sms-automations-inactive",
    schedule: "Hit this route like monitors/digests cron (bounded 14-day inactivity SMS)",
  });
}
