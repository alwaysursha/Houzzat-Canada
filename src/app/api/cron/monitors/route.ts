import { NextResponse } from "next/server";
import { runAllMonitorChecks } from "@/lib/account/monitors";

function authorizeMonitorCron(request: Request): boolean {
  const secret =
    process.env.MONITOR_CRON_SECRET?.trim() ||
    process.env.DIGEST_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.MLS_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-monitor-cron-secret");
  const digestHeader = request.headers.get("x-digest-cron-secret");
  const auth = request.headers.get("authorization");
  if (header && header === secret) return true;
  if (digestHeader && digestHeader === secret) return true;
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

/**
 * Scheduled Watch Property / Watch Area checks.
 * Auth: MONITOR_CRON_SECRET | DIGEST_CRON_SECRET | CRON_SECRET | MLS_SYNC_SECRET
 * via Bearer, x-monitor-cron-secret, or x-digest-cron-secret.
 *
 * Optional JSON body: { userId?: string } — scoped QA for one buyer only.
 */
export async function POST(request: Request) {
  if (!authorizeMonitorCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const url = new URL(request.url);
  const userId = body.userId ?? url.searchParams.get("userId") ?? undefined;

  const result = await runAllMonitorChecks(userId);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  if (!authorizeMonitorCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    job: "monitors",
    schedule: "every ~10 minutes (GitHub Actions + optional Mac LaunchAgent)",
  });
}
