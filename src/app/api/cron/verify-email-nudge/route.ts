import { NextResponse } from "next/server";
import {
  EMAIL_VERIFY_NUDGE_CRON,
  runVerifyEmailNudgeJob,
} from "@/lib/auth/verify-email-nudge";

function authorizeVerifyEmailNudgeCron(request: Request): boolean {
  const secret =
    process.env.VERIFY_EMAIL_NUDGE_CRON_SECRET?.trim() ||
    process.env.MONITOR_CRON_SECRET?.trim() ||
    process.env.DIGEST_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-verify-email-nudge-cron-secret");
  const monitorHeader = request.headers.get("x-monitor-cron-secret");
  const digestHeader = request.headers.get("x-digest-cron-secret");
  const auth = request.headers.get("authorization");
  if (header && header === secret) return true;
  if (monitorHeader && monitorHeader === secret) return true;
  if (digestHeader && digestHeader === secret) return true;
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

/**
 * Automatic delayed "Verify your email" sends.
 * Auth: VERIFY_EMAIL_NUDGE_CRON_SECRET | MONITOR_CRON_SECRET | DIGEST_CRON_SECRET | CRON_SECRET
 */
export async function POST(request: Request) {
  if (!authorizeVerifyEmailNudgeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runVerifyEmailNudgeJob();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  if (!authorizeVerifyEmailNudgeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    job: EMAIL_VERIFY_NUDGE_CRON.job,
    schedule: EMAIL_VERIFY_NUDGE_CRON.schedule,
  });
}
