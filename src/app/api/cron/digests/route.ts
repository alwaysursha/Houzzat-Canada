import { NextResponse } from "next/server";
import { runDigestJobs } from "@/lib/email/digests";

function authorizeDigestRequest(request: Request): boolean {
  const secret =
    process.env.DIGEST_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-digest-cron-secret");
  const auth = request.headers.get("authorization");
  if (header && header === secret) return true;
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

/**
 * Cron / manual: daily Saved Search Digests + (Monday) Neighborhood Weekly.
 * Auth: DIGEST_CRON_SECRET | CRON_SECRET via Bearer or x-digest-cron-secret.
 */
export async function POST(request: Request) {
  if (!authorizeDigestRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    userId?: string;
    dryRun?: boolean;
    forceSeller?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const url = new URL(request.url);
  const userId = body.userId ?? url.searchParams.get("userId") ?? undefined;
  const dryRun =
    body.dryRun === true || url.searchParams.get("dryRun") === "1";
  const forceSeller =
    body.forceSeller === true ||
    url.searchParams.get("forceSeller") === "1" ||
    Boolean(userId);

  const result = await runDigestJobs({
    userId,
    dryRun,
    forceSeller,
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  if (!authorizeDigestRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    job: "digests",
    schedule: "daily ~06:00 America/Toronto (UTC 10:00 / 11:00 DST)",
    sellers: "Monday only (America/Toronto) unless forceSeller",
  });
}
