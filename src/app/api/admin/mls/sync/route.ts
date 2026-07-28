import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/owner/auth";
import {
  getPropTxSyncHealth,
  runPropTxMlsSync,
} from "@/lib/proptx/sync";

function authorizeSyncRequest(request: Request): boolean {
  const secret = process.env.MLS_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-mls-sync-secret");
  const auth = request.headers.get("authorization");
  if (header && header === secret) return true;
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

/** Admin / cron: PropTx → Postgres sync status. */
export async function GET(request: Request) {
  const admin = await requireAdminUser();
  const cronOk = authorizeSyncRequest(request);
  if (!admin && !cronOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = await getPropTxSyncHealth();
  return NextResponse.json(health);
}

/** Admin / cron: run incremental (or bounded backfill) PropTx VOW sync. */
export async function POST(request: Request) {
  const admin = await requireAdminUser();
  const cronOk = authorizeSyncRequest(request);
  if (!admin && !cronOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    maxPages?: number;
    fullBackfillDays?: number;
    resources?: Array<"property" | "media" | "openHouse" | "history">;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const result = await runPropTxMlsSync({
    maxPages: body.maxPages,
    fullBackfillDays: body.fullBackfillDays,
    resources: body.resources,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
