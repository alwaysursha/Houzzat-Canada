import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "CLOSED"]),
});

type Params = { params: Promise<{ token: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { token } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const handoff = await prisma.referralHandoff.findUnique({ where: { token } });
  if (!handoff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.referralHandoff.update({
    where: { id: handoff.id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true, item: updated });
}
