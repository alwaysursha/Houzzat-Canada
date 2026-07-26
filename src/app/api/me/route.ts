import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import { requireAgentUser } from "@/lib/agent";
import { auth } from "@/lib/auth";

/**
 * Lightweight session↔DB check. Returns 401 when the JWT is present but the
 * user row is missing/stale (common after a DB rebuild) so clients can sign out.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const customer = await requireCustomerUser();
  if (customer) {
    return NextResponse.json({
      authenticated: true,
      id: customer.id,
      email: customer.email,
      role: customer.role,
    });
  }

  const agent = await requireAgentUser();
  if (agent) {
    return NextResponse.json({
      authenticated: true,
      id: agent.id,
      email: agent.email,
      role: agent.role,
    });
  }

  return NextResponse.json(
    { authenticated: false, stale: true },
    { status: 401 },
  );
}
