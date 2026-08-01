import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ingestActivityBeacon, type BeaconPayload } from "@/lib/admin/activity";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: BeaconPayload;
  try {
    body = (await req.json()) as BeaconPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.visitorKey || !body?.sessionKey || !body?.type) {
    return NextResponse.json(
      { error: "visitorKey, sessionKey, and type are required" },
      { status: 400 },
    );
  }

  const session = await auth();
  const userAgent = req.headers.get("user-agent");

  try {
    const result = await ingestActivityBeacon(body, {
      userId: session?.user?.id ?? null,
      userAgent,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Beacon failed" },
      { status: 400 },
    );
  }
}
