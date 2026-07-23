import { NextResponse } from "next/server";
import { z } from "zod";
import type { AppointmentStatus } from "@prisma/client";
import { requireOwnerUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  appointmentId: z.string().min(1),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]),
});

export async function PATCH(request: Request) {
  const user = await requireOwnerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.data.appointmentId },
  });
  if (!appointment?.listingMls) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const listing = await prisma.listing.findFirst({
    where: {
      mlsNumber: appointment.listingMls,
      ownerUserId: user.id,
      dataSource: "fsbo",
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: parsed.data.status as AppointmentStatus },
  });

  return NextResponse.json({ ok: true, appointment: updated });
}
