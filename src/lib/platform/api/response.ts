import { NextResponse } from "next/server";

export function platformOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true as const, data }, init);
}

export function platformError(
  status: number,
  code: string,
  message: string,
) {
  return NextResponse.json(
    { ok: false as const, code, message },
    { status },
  );
}
