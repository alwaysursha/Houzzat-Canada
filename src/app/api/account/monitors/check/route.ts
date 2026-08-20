import { NextResponse } from "next/server";
import { requireFullCustomerUser } from "@/lib/account";
import { runAllMonitorChecks } from "@/lib/account/monitors";

/** Dev/self-check + optional manual refresh — diffs monitors for the signed-in user only. */
export async function POST() {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const result = await runAllMonitorChecks(user.id);
  return NextResponse.json({ ok: true, ...result });
}
