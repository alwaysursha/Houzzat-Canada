import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { logLeadActivityForCustomer } from "@/lib/agent/log-contact-activity";
import { prisma } from "@/lib/prisma";

const SLOTS = ["home", "work", "school"] as const;
type SlotId = (typeof SLOTS)[number];

const schema = z.object({
  slot: z.enum(SLOTS),
  address: z.string().trim().min(3).max(240),
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
});

function slotLabel(slot: SlotId): string {
  switch (slot) {
    case "home":
      return "Home address";
    case "work":
      return "Work address";
    case "school":
      return "School address";
    default: {
      const exhaustive: never = slot;
      return exhaustive;
    }
  }
}

function placeUpdate(
  slot: SlotId,
  address: string,
  lat: number,
  lng: number,
): Prisma.UserUpdateInput {
  switch (slot) {
    case "home":
      return { homeAddress: address, homeLat: lat, homeLng: lng };
    case "work":
      return { workAddress: address, workLat: lat, workLng: lng };
    case "school":
      return { schoolAddress: address, schoolLat: lat, schoolLng: lng };
    default: {
      const exhaustive: never = slot;
      return exhaustive;
    }
  }
}

const commuteSelect = {
  homeAddress: true,
  homeLat: true,
  homeLng: true,
  workAddress: true,
  workLat: true,
  workLng: true,
  schoolAddress: true,
  schoolLat: true,
  schoolLng: true,
} satisfies Prisma.UserSelect;

type CommuteRow = {
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
  workAddress: string | null;
  workLat: number | null;
  workLng: number | null;
  schoolAddress: string | null;
  schoolLat: number | null;
  schoolLng: number | null;
};

function toPlaces(row: CommuteRow) {
  function place(
    address: string | null,
    lat: number | null,
    lng: number | null,
  ) {
    if (!address || lat == null || lng == null) return null;
    return { address, lat, lng };
  }
  return {
    home: place(row.homeAddress, row.homeLat, row.homeLng),
    work: place(row.workAddress, row.workLat, row.workLng),
    school: place(row.schoolAddress, row.schoolLat, row.schoolLng),
  };
}

export async function GET() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: commuteSelect,
    });
    if (!row) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    return NextResponse.json({ places: toPlaces(row) });
  } catch (error) {
    console.error("[commute] read failed", error);
    return NextResponse.json(
      { error: "Saved addresses are unavailable." },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid address." }, { status: 400 });
  }

  const { slot, address, lat, lng } = parsed.data;
  const label = slotLabel(slot);

  try {
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: commuteSelect,
    });
    if (!current) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: placeUpdate(slot, address, lat, lng),
      select: commuteSelect,
    });

    const previous = toPlaces(current)[slot];
    const changed =
      !previous ||
      previous.address !== address ||
      previous.lat !== lat ||
      previous.lng !== lng;
    if (changed) {
      await logLeadActivityForCustomer({
        customerId: user.id,
        workspaceId: user.workspaceId,
        type: "commute_address",
        body: `${label}: ${address}`,
        actorUserId: user.id,
        meta: { slot, label, address, lat, lng },
      });
    }

    return NextResponse.json({ places: toPlaces(updated) });
  } catch (error) {
    console.error("[commute] save failed", error);
    return NextResponse.json(
      { error: "Could not save this address." },
      { status: 503 },
    );
  }
}
