import { prisma } from "@/lib/prisma";
import type { SyncPoi } from "@/lib/poi/sync/types";

export async function upsertPois(
  pois: SyncPoi[],
): Promise<{ upserted: number }> {
  let upserted = 0;
  const chunkSize = 40;
  for (let i = 0; i < pois.length; i += chunkSize) {
    const chunk = pois.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (poi) => {
        await prisma.poi.upsert({
          where: {
            source_sourceId: {
              source: poi.source,
              sourceId: poi.sourceId,
            },
          },
          create: {
            type: poi.type,
            name: poi.name,
            address: poi.address ?? null,
            city: poi.city ?? null,
            lat: poi.lat,
            lng: poi.lng,
            source: poi.source,
            sourceId: poi.sourceId,
            meta: poi.meta ?? undefined,
          },
          update: {
            type: poi.type,
            name: poi.name,
            address: poi.address ?? null,
            city: poi.city ?? null,
            lat: poi.lat,
            lng: poi.lng,
            meta: poi.meta ?? undefined,
          },
        });
        upserted += 1;
      }),
    );
  }
  return { upserted };
}
