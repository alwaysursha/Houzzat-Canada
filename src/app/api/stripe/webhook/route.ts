import { NextResponse } from "next/server";

/** Stripe webhook shell — wire signature verify when Stripe goes live. */
export async function POST() {
  return NextResponse.json({
    ok: true,
    message: "Stripe webhook stub — not processing events yet.",
  });
}
