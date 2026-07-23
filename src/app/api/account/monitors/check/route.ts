import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import { runAllMonitorChecks } from "@/lib/account/monitors";

/** Dev/self-check stub — diffs monitors and writes CustomerAlert rows. */
export async function POST() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result = await runAllMonitorChecks(user.id);
  return NextResponse.json({ ok: true, ...result });
}
