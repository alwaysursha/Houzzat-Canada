import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ListingAccountChromePayload = {
  saved: boolean;
  watching: boolean;
  noteBody: string;
  relatedListingsMode: "SAME_AREA" | "SAME_FEATURES";
  phone: string | null;
};

const emptyChrome = (): ListingAccountChromePayload => ({
  saved: false,
  watching: false,
  noteBody: "",
  relatedListingsMode: "SAME_AREA",
  phone: null,
});

/**
 * Signed-in listing chrome (save / watch / note / prefs / phone) —
 * for private after-paint API, not listing RSC.
 */
export async function loadListingAccountChrome(
  mlsNumberRaw: string,
): Promise<ListingAccountChromePayload> {
  const mlsNumber = mlsNumberRaw.trim().toUpperCase();
  if (!mlsNumber) return emptyChrome();

  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return emptyChrome();

  const user = await prisma.user
    .findUnique({
      where: { email },
      select: {
        id: true,
        phone: true,
        relatedListingsMode: true,
      },
    })
    .catch(async () => {
      const base = await prisma.user
        .findUnique({
          where: { email },
          select: { id: true, phone: true },
        })
        .catch(() => null);
      return base
        ? { ...base, relatedListingsMode: "SAME_AREA" as const }
        : null;
    });

  if (!user) return emptyChrome();

  const [savedRow, watchRow, noteRow] = await Promise.all([
    prisma.savedListing.findUnique({
      where: {
        userId_mlsNumber: { userId: user.id, mlsNumber },
      },
      select: { id: true },
    }),
    prisma.propertyMonitor.findUnique({
      where: {
        userId_mlsNumber: { userId: user.id, mlsNumber },
      },
      select: { id: true },
    }),
    prisma.listingNote.findUnique({
      where: {
        userId_mlsNumber: { userId: user.id, mlsNumber },
      },
      select: { body: true },
    }),
  ]);

  return {
    saved: Boolean(savedRow),
    watching: Boolean(watchRow),
    noteBody: noteRow?.body ?? "",
    relatedListingsMode:
      user.relatedListingsMode === "SAME_FEATURES"
        ? "SAME_FEATURES"
        : "SAME_AREA",
    phone: user.phone?.trim() || null,
  };
}
