import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingCard } from "@/components/listings/ListingCard";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { SITE_NAME } from "@/lib/constants";
import { toCard } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ token: string }> };

type SharePayload = {
  mls: string[];
  title?: string;
  note?: string;
  by?: string;
};

function decodeSharePayload(token: string): SharePayload | null {
  try {
    const padded =
      token + "=".repeat((4 - (token.length % 4 || 4)) % 4);
    const json = Buffer.from(padded, "base64url").toString("utf8");
    const data = JSON.parse(json) as SharePayload;
    if (!Array.isArray(data.mls) || data.mls.length === 0) return null;
    const mls = data.mls
      .filter((m): m is string => typeof m === "string")
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, 24);
    if (!mls.length) return null;
    return {
      mls,
      title:
        typeof data.title === "string" && data.title.trim()
          ? data.title.trim().slice(0, 120)
          : "Homes selected for you",
      note:
        typeof data.note === "string" && data.note.trim()
          ? data.note.trim().slice(0, 2000)
          : undefined,
      by:
        typeof data.by === "string" && data.by.trim()
          ? data.by.trim().slice(0, 80)
          : undefined,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params) {
  const { token } = await params;
  const payload = decodeSharePayload(token);
  return {
    title: payload
      ? `${payload.title ?? "Homes for you"} · ${SITE_NAME}`
      : "Homes for you",
  };
}

export default async function ListingSharePage({ params }: Params) {
  const { token } = await params;
  const payload = decodeSharePayload(token);
  if (!payload) notFound();

  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: payload.mls } },
    include: { media: true, openHouses: true },
  });
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));
  const cards = payload.mls
    .map((mls) => byMls.get(mls))
    .filter(Boolean)
    .map((l) => toCard(l!));

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/45">
          Shared shortlist
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
          {payload.title}
        </h1>
        {payload.note ? (
          <p className="mt-3 text-[15px] leading-relaxed text-ink/70">
            {payload.note}
          </p>
        ) : (
          <p className="mt-3 text-[15px] text-ink/60">
            Your agent picked these homes for you on {SITE_NAME}.
          </p>
        )}
        <p className="mt-2 text-sm text-ink/45">
          {cards.length} home{cards.length === 1 ? "" : "s"}
          {payload.by ? ` · shared by ${payload.by}` : ""}
        </p>
      </header>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-12 text-center text-sm text-ink/50">
          These listings are no longer available.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((listing) => (
            <ListingCard key={listing.mlsNumber} listing={listing} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Link
          href="/search"
          className="rounded-full bg-canopy px-5 py-2.5 text-sm font-semibold text-white"
        >
          Browse more homes
        </Link>
        <Link
          href="/auth/sign-in"
          className="text-sm font-semibold text-canopy hover:underline"
        >
          Save favourites with an account
        </Link>
      </div>

      <MlsDisclaimer />
    </div>
  );
}
