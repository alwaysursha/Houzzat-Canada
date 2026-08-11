import { NextResponse } from "next/server";
import { loadHomeCustomerShell } from "@/lib/home/load-home-customer-shell";

/** Signed-in homepage personalization / tools / rails — private, after paint. */
export async function GET() {
  try {
    const shell = await loadHomeCustomerShell();
    return NextResponse.json(shell, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load homepage shell" },
      { status: 500 },
    );
  }
}
