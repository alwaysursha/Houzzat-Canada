import { ListingLink } from "@/components/listings/ListingLink";
import { ListingPhoto } from "@/components/listings/ListingPhoto";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import {
  formatListingBedsLabel,
  formatListPrice,
  formatListingAddress,
  isClosedListingStatus,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";

function formatStat(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Stage 6.11B.5 — Agent Signature homepage Featured editorial card only.
 * Isolated from shared ListingCard (Default / Search / rails unchanged).
 */
export function AgentSignatureFeaturedCard({
  listing,
}: {
  listing: ListingCardData;
}) {
  const isLease = listing.transactionType === "LEASE";
  const isCommercial = listing.segment === "COMMERCIAL";
  const isClosed = isClosedListingStatus(listing.status);
  const addressLines = formatListingAddress(listing);
  const facts: string[] = [];
  if (!isCommercial) {
    facts.push(`${formatListingBedsLabel(listing)} Beds`);
    facts.push(`${formatStat(listing.baths)} Baths`);
  }
  const typeLabel = propertyTypeLabel(listing.propertyType);
  if (typeLabel) facts.push(typeLabel);

  return (
    <article className="group flex flex-col" data-as-featured-card="editorial">
      <ListingLink href={listingPath(listing)} className="flex flex-col">
        <div className="relative aspect-[5/4] overflow-hidden bg-mist">
          {listing.primaryImageUrl ? (
            <ListingPhoto
              src={listing.primaryImageUrl}
              alt={listing.addressLine}
              fill
              className="object-cover transition duration-700 group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-canopy-deep/40 via-transparent to-transparent" />
          <p className="absolute bottom-3 left-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-surface">
            {listingStatusLabel(listing.status, listing.transactionType)}
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-5">
          <p className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            {isClosed && listing.soldPrice != null
              ? formatListPrice(listing.soldPrice, listing.transactionType)
              : formatListPrice(listing.listPrice, listing.transactionType)}
            {isLease && !isClosed ? (
              <span className="ml-1 font-sans text-sm font-medium text-ink/45">
                /mo
              </span>
            ) : null}
          </p>

          <div className="text-sm leading-snug text-ink/75">
            {addressLines.map((line, index) => (
              <p key={`${line}-${index}`}>
                {line}
                {index < addressLines.length - 1 ? "," : ""}
              </p>
            ))}
          </div>

          {facts.length > 0 ? (
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.1em] text-ink/45">
              {facts.join(" · ")}
            </p>
          ) : null}
        </div>
      </ListingLink>

      {listing.brokerageName ? (
        <p className="mt-3 text-[10px] leading-snug text-ink/40">
          {listing.brokerageName}
        </p>
      ) : null}
    </article>
  );
}
