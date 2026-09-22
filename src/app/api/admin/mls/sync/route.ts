import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/owner/auth";
import { getPropTxSyncHealth } from "@/lib/proptx/sync-health";

function authorizeSyncRequest(request: Request): boolean {
  const secret = process.env.MLS_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-mls-sync-secret");
  const auth = request.headers.get("authorization");
  if (header && header === secret) return true;
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

/** Admin / cron: read-only PropTx sync status. Does not start a sync. */
export async function GET(request: Request) {
  const admin = await requireAdminUser();
  const cronOk = authorizeSyncRequest(request);
  if (!admin && !cronOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = await getPropTxSyncHealth();
  return NextResponse.json(health);
}

/** MLS sync no longer runs on the website. The Sync Mac is the only writer. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "MLS sync is disabled on the website. Synchronization runs only on the Sync Mac.",
    },
    { status: 410 },
  );
}
