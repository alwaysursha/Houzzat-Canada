import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ViewingShareClient } from "@/components/viewings/ViewingShareClient";
import { enrichTourStops } from "@/lib/route-planner/server";
import { serializeProViewingsPlannerPayload } from "@/lib/mobile/v2/viewings-planner";
import { resolvePublicViewingShareBrand } from "@/lib/tenancy/resolve-public-viewing-share-brand";
import { prisma } from "@/lib/prisma";
import { buildTenantThemeCss } from "@/lib/tenancy/brand-theme-css";

type Params = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  if (!token || token.length < 8) {
    return { title: "Viewing Schedule", robots: { index: false, follow: false } };
  }

  const tour = await prisma.viewingTour.findFirst({
    where: { shareToken: token },
    select: { workspaceId: true, viewingDate: true },
  });
  if (!tour?.workspaceId) {
    return { title: "Viewing Schedule", robots: { index: false, follow: false } };
  }

  const brand = await resolvePublicViewingShareBrand(tour.workspaceId);
  const datePart = tour.viewingDate
    ? tour.viewingDate.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      })
    : null;
  const title = datePart
    ? `Viewing Schedule · ${datePart} | ${brand.displayName}`
    : `Viewing Schedule | ${brand.displayName}`;

  return {
    title,
    description: brand.seoDescription,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: brand.seoDescription,
      images: brand.ogImageUrl ? [{ url: brand.ogImageUrl }] : undefined,
    },
  };
}

export default async function ViewingSharePage({ params }: Params) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();

  const tour = await prisma.viewingTour.findFirst({
    where: { shareToken: token },
    include: { stops: { orderBy: { sortOrder: "asc" } } },
  });
  if (!tour?.workspaceId) notFound();

  const brand = await resolvePublicViewingShareBrand(tour.workspaceId);
  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));

  let agent: { name: string | null; email: string | null; phone: string | null } | null =
    null;
  if (tour.agentId) {
    agent = await prisma.user.findUnique({
      where: { id: tour.agentId },
      select: { name: true, email: true, phone: true },
    });
  }

  const payload = serializeProViewingsPlannerPayload(tour, cards, brand, agent ?? undefined);
  const themeCss = buildTenantThemeCss(brand.colors);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <ViewingShareClient tour={payload} brand={brand} agent={agent} />
    </>
  );
}
