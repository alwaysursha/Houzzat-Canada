import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import { prisma } from "@/lib/prisma";

/**
 * Persist at most {@link NEON_LISTING_MEDIA_CAP} MLS photo URLs to Neon.
 * Used after a live PropTx gallery fetch so the next SSR paint has a full grid.
 * Never stores photos beyond the cap.
 */
export async function persistNeonListingMediaCap(
  listingId: string,
  photos: Array<{
    url: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }>,
): Promise<void> {
  const selected = photos
    .filter((photo) => {
      const url = photo.url?.trim();
      if (!url) return false;
      // Never store proxy URLs in Neon — only absolute media hosts.
      if (url.startsWith("/api/listings/photo")) return false;
      return /^https?:\/\//i.test(url);
    })
    .slice(0, NEON_LISTING_MEDIA_CAP);

  if (selected.length === 0) return;

  const keepUrls = new Set(selected.map((photo) => photo.url.trim()));

  for (let index = 0; index < selected.length; index += 1) {
    const photo = selected[index]!;
    const url = photo.url.trim();
    const sortOrder = photo.sortOrder ?? index;
    const isPrimary = photo.isPrimary ?? index === 0;

    const existing = await prisma.listingMedia.findFirst({
      where: { listingId, url },
      select: { id: true },
    });
    if (existing) {
      await prisma.listingMedia.update({
        where: { id: existing.id },
        data: { sortOrder, isPrimary },
      });
    } else {
      await prisma.listingMedia.create({
        data: { listingId, url, sortOrder, isPrimary },
      });
    }
    if (isPrimary) {
      await prisma.listingMedia.updateMany({
        where: { listingId, NOT: { url } },
        data: { isPrimary: false },
      });
    }
  }

  await prisma.listingMedia.deleteMany({
    where: {
      listingId,
      url: { notIn: [...keepUrls] },
    },
  });
}
