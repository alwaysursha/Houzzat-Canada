import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import { pickAssigneeAgentId } from "@/lib/agent";
import { sendNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80).optional(),
  propertyType: z.string().optional(),
  beds: z.number().min(0).max(20).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().email().optional()),
  phone: z.string().trim().max(40).optional(),
  intent: z.enum(["sell", "buy", "curious"]).default("curious"),
  quick: z.boolean().optional(),
  estimatedLow: z.number().optional(),
  estimatedHigh: z.number().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
});

/** Rough demo range from nearby active listings — not a formal AVM. */
async function estimateRange(city?: string, beds?: number) {
  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      transactionType: "SALE",
      segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
      ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
      ...(beds != null
        ? { beds: { gte: Math.max(beds - 1, 0), lte: beds + 1 } }
        : {}),
    },
    select: { listPrice: true },
    take: 40,
  });

  if (listings.length < 3) {
    return { low: 750000, high: 1250000, sampleSize: listings.length };
  }

  const prices = listings.map((l) => l.listPrice).sort((a, b) => a - b);
  const low = prices[Math.floor(prices.length * 0.25)] ?? prices[0]!;
  const high =
    prices[Math.floor(prices.length * 0.75)] ?? prices[prices.length - 1]!;
  return { low, high, sampleSize: prices.length };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid home address." },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const isQuick = Boolean(data.quick);
    const hasContact = Boolean(data.name?.trim() && data.email?.trim());

    if (!isQuick && !hasContact) {
      return NextResponse.json(
        { error: "Please provide address, name, and email." },
        { status: 400 },
      );
    }

    const session = await auth();
    const estimate =
      data.estimatedLow && data.estimatedHigh
        ? {
            low: data.estimatedLow,
            high: data.estimatedHigh,
            sampleSize: 0,
          }
        : await estimateRange(data.city, data.beds);

    const assigneeId = await pickAssigneeAgentId();
    const assignee = assigneeId
      ? await prisma.user.findUnique({
          where: { id: assigneeId },
          select: { email: true, phone: true },
        })
      : null;

    const utm = pickUtm(data);
    const adCampaignId = await resolveAdCampaignId(utm);
    const contactName =
      data.name?.trim() ||
      session?.user?.name ||
      (isQuick ? "Hero sell visitor" : "Valuation visitor");
    const contactEmail =
      data.email?.trim() ||
      session?.user?.email ||
      (isQuick ? "pending@houzzat.ca" : undefined);

    if (!contactEmail) {
      return NextResponse.json(
        { error: "Please provide address, name, and email." },
        { status: 400 },
      );
    }

    const lead = await prisma.lead.create({
      data: {
        source: "HOME_VALUATION",
        status: "NEW",
        score: data.intent === "sell" ? 60 : 35,
        customerId: session?.user?.id,
        assignedAgentId: assigneeId,
        ...utmLeadFields(utm, adCampaignId),
        notes: [
          `Valuation request for ${data.address}`,
          data.city ? `City: ${data.city}` : null,
          data.propertyType ? `Type: ${data.propertyType}` : null,
          data.beds != null ? `Beds: ${data.beds}` : null,
          `Intent: ${data.intent}`,
          isQuick ? "Captured from homepage Sell a Home → Get Estimate" : null,
          `Indicative range (demo): $${estimate.low.toLocaleString()} – $${estimate.high.toLocaleString()}`,
          `Contact: ${contactName} <${contactEmail}>`,
          data.phone ? `Phone: ${data.phone}` : null,
          isQuick && !hasContact
            ? "Contact details pending — customer sent to valuation page"
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
        activities: {
          create: {
            type: "home_valuation",
            userId: session?.user?.id,
            body: data.address,
            meta: {
              email: contactEmail,
              phone: data.phone,
              intent: data.intent,
              quick: isQuick,
              estimate,
            },
          },
        },
        appointments: isQuick
          ? undefined
          : {
              create: {
                type: "VALUATION_CALL",
                status: "REQUESTED",
                customerId: session?.user?.id,
                agentId: assigneeId,
                notes: `Valuation follow-up for ${data.address}`,
              },
            },
      },
    });

    if (assignee?.email) {
      void sendNotification({
        toEmail: assignee.email,
        toPhone: assignee.phone,
        subject: isQuick
          ? "New homepage sell estimate lead"
          : "New home valuation lead",
        text: `Valuation lead: ${data.address}\n${contactName} <${contactEmail}>\nLead: ${lead.id}`,
        smsText: `Houzzat valuation lead: ${data.address}`,
      });
    }

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      estimate: {
        low: estimate.low,
        high: estimate.high,
        disclaimer:
          "Indicative range pulled using technology from nearby market activity — not a formal appraisal. Book an appointment for a precise valuation.",
      },
    });
  } catch (error) {
    console.error("[valuation]", error);
    return NextResponse.json(
      { error: "Could not submit valuation." },
      { status: 500 },
    );
  }
}
