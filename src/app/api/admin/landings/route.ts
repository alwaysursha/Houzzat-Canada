import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAgentUser } from "@/lib/agent";
import { isAdminRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await requireAgentUser();
  if (!user || !isAdminRole(user.role)) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.landingPage.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ items });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(2).max(160),
  headline: z.string().trim().max(200).optional(),
  subtitle: z.string().trim().max(1000).optional(),
  ctaLabel: z.string().trim().max(80).optional(),
  ctaHref: z.string().trim().max(200).optional(),
  heroImageUrl: z.string().trim().max(500).optional(),
  areaFocus: z.string().trim().max(120).optional(),
  utmCampaign: z.string().trim().max(120).optional(),
  published: z.boolean().optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = upsertSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid landing page." }, { status: 400 });
  }

  const data = parsed.data;
  const payload: Prisma.LandingPageCreateInput = {
    slug: data.slug,
    title: data.title,
    headline: data.headline,
    subtitle: data.subtitle,
    ctaLabel: data.ctaLabel ?? "Get started",
    ctaHref: data.ctaHref ?? "/home-valuation",
    heroImageUrl: data.heroImageUrl,
    areaFocus: data.areaFocus,
    utmCampaign: data.utmCampaign,
    published: data.published ?? false,
    ownerAgent: { connect: { id: admin.id } },
  };

  const item = data.id
    ? await prisma.landingPage.update({
        where: { id: data.id },
        data: {
          slug: data.slug,
          title: data.title,
          headline: data.headline,
          subtitle: data.subtitle,
          ctaLabel: data.ctaLabel,
          ctaHref: data.ctaHref,
          heroImageUrl: data.heroImageUrl,
          areaFocus: data.areaFocus,
          utmCampaign: data.utmCampaign,
          published: data.published,
        },
      })
    : await prisma.landingPage.create({ data: payload });

  return NextResponse.json({ ok: true, item });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await prisma.landingPage.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
