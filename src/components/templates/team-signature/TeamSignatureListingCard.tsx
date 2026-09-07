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
 * Stage 6.11E.2B — Team Signature featured listing card (contrast-tuned overlay).
 * Isolated from AgentSignatureFeaturedCard and shared ListingCard.
 */
export function TeamSignatureListingCard({
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

  const price =
    isClosed && listing.soldPrice != null
      ? formatListPrice(listing.soldPrice, listing.transactionType)
      : formatListPrice(listing.listPrice, listing.transactionType);

  return (
    <article className="group" data-ts-listing-card="architectural">
      <ListingLink href={listingPath(listing)} className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-[var(--ts-surface-muted,#EEF3F0)] sm:aspect-[5/4]">
          {listing.primaryImageUrl ? (
            <ListingPhoto
              src={listing.primaryImageUrl}
              alt={listing.addressLine}
              fill
              className="object-cover transition duration-700 group-hover:scale-[1.04]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : null}
          {/* Stronger lower scrim for status/price/address — keeps upper image open */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-ink-deep,#0A4D38)] from-0% via-[var(--ts-ink-deep,#0A4D38)]/70 via-35% to-transparent to-65%" />
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-surface [text-shadow:0_1px_2px_rgb(0_0_0_/0.45)]">
              {listingStatusLabel(listing.status, listing.transactionType)}
            </p>
            <p className="font-display text-2xl tracking-tight text-surface [text-shadow:0_1px_3px_rgb(0_0_0_/0.35)] sm:text-3xl">
              {price}
              {isLease && !isClosed ? (
                <span className="ml-1 font-sans text-sm font-medium text-surface/90">
                  /mo
                </span>
              ) : null}
            </p>
            <div className="text-sm leading-snug text-surface [text-shadow:0_1px_2px_rgb(0_0_0_/0.4)]">
              {addressLines.map((line, index) => (
                <p key={`${line}-${index}`}>
                  {line}
                  {index < addressLines.length - 1 ? "," : ""}
                </p>
              ))}
            </div>
            {facts.length > 0 ? (
              <p className="pt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-surface/90 [text-shadow:0_1px_2px_rgb(0_0_0_/0.35)]">
                {facts.join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
      </ListingLink>
      {listing.brokerageName ? (
        <p className="mt-2 text-[10px] leading-snug text-[var(--ts-ink,#0F6B4C)]/75">
          {listing.brokerageName}
        </p>
      ) : null}
    </article>
  );
}
