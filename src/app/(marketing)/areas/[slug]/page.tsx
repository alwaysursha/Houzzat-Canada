import { notFound, permanentRedirect } from "next/navigation";
import { legacyAreaSlugToHomesForSalePath } from "@/lib/geo/area-seo";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ slug: string }> };

/**
 * Legacy flat area URLs (`/areas/toronto-the-beaches`) permanently redirect
 * to canonical `/homes-for-sale/{city}/{community}` paths.
 */
export default async function LegacyAreaRedirectPage({ params }: Params) {
  const { slug } = await params;
  const place = await prisma.geoPlace.findUnique({
    where: { slug },
    select: { city: true, community: true, published: true },
  });
  if (!place || !place.published) notFound();
  permanentRedirect(legacyAreaSlugToHomesForSalePath(place));
}
