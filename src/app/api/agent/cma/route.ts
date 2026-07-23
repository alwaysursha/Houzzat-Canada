import { NextResponse } from "next/server";
import { z } from "zod";
import { findComps, summarizeCma } from "@/lib/market/cma";
import { requireAgentUser } from "@/lib/agent";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/constants";

const schema = z.object({
  listingMls: z.string().optional(),
  address: z.string().optional(),
  city: z.string().min(2),
  community: z.string().optional(),
  beds: z.number().optional(),
  baths: z.number().optional(),
  lat: z.number(),
  lng: z.number(),
});

export async function POST(request: Request) {
  const agent = await requireAgentUser();
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid CMA input" }, { status: 400 });
  }

  const data = parsed.data;
  let listingMls = data.listingMls;
  let address = data.address;
  let beds = data.beds;
  let baths = data.baths;
  let lat = data.lat;
  let lng = data.lng;
  let city = data.city;
  let community = data.community;

  if (listingMls) {
    const listing = await prisma.listing.findUnique({
      where: { mlsNumber: listingMls },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    address = listing.addressLine;
    beds = listing.beds;
    baths = listing.baths;
    lat = listing.lat;
    lng = listing.lng;
    city = listing.city;
    community = listing.community ?? undefined;
  }

  const comps = await findComps({
    lat,
    lng,
    beds,
    city,
    includeSold: true,
    limit: 8,
  });

  const filtered = listingMls
    ? comps.filter((c) => c.mlsNumber !== listingMls)
    : comps;

  const summary = summarizeCma(filtered);
  const report = await prisma.cmaReport.create({
    data: {
      listingMls,
      subjectAddress: address,
      city,
      community,
      beds,
      baths,
      lat,
      lng,
      summary,
      comps: filtered,
      agentId: agent.id,
    },
  });

  return NextResponse.json({
    ok: true,
    id: report.id,
    token: report.token,
    shareUrl: `${SITE_URL}/cma/${report.token}`,
    summary,
    comps: filtered,
  });
}

export async function GET() {
  const agent = await requireAgentUser();
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const items = await prisma.cmaReport.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ items });
}
