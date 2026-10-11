"use client";

import { useState } from "react";
import { Bath, Bed, ImageOff } from "lucide-react";
import { ListingLink } from "@/components/listings/ListingLink";
import { ListingPhoto } from "@/components/listings/ListingPhoto";
import {
  LISTING_SHARE_MESSAGE_BODY,
  resolveChatListingShareView,
  type ListingSharePresentView,
} from "@/lib/conversations/listing-share/payload";
import {
  formatListPrice,
  formatListingAddress,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import { cn } from "@/lib/utils";

export { resolveChatListingShareView };

function formatBeds(beds: number): string {
  return Number.isInteger(beds) ? String(beds) : beds.toFixed(1);
}

function formatBaths(baths: number): string {
  return Number.isInteger(baths) ? String(baths) : baths.toFixed(1);
}

function ListingShareImage({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(src) && !failed;

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-mist via-[#e4efe9] to-[#d5e6dc]">
      {showPhoto && src ? (
        <ListingPhoto
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 420px) 85vw, 320px"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-canopy/45">
          <ImageOff className="size-7" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
            Photo unavailable
          </span>
        </div>
      )}
    </div>
  );
}

function ListingShareCardBody({
  view,
  className,
}: {
  view: ListingSharePresentView;
  className?: string;
}) {
  const [street, cityLine] = formatListingAddress({
    addressLine: view.addressLine,
    unitNumber: view.unitNumber,
    city: view.city,
    province: view.province,
    postalCode: view.postalCode,
  });
  const price = formatListPrice(view.listPrice, view.transactionType);
  const status = listingStatusLabel(view.status, view.transactionType);
  const typeLabel = propertyTypeLabel(view.propertyType);
  const photoAlt = street || "Shared property";

  return (
    <article
      className={cn(
        "w-full max-w-[min(100%,17.5rem)] overflow-hidden rounded-2xl bg-white text-ink shadow-[0_8px_24px_-12px_rgba(15,107,76,0.28)] ring-1 ring-canopy/12 sm:max-w-[19rem]",
        className,
      )}
      aria-label={`Shared property, ${price}, ${street}`}
    >
      <div className="relative">
        <ListingShareImage src={view.primaryImageUrl} alt={photoAlt} />
        <span
          className={cn(
            "absolute left-2.5 top-2.5 z-[1] rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm",
            listingStatusBadgeClass(view.status),
          )}
        >
          {status}
        </span>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-canopy/70">
          Shared property
        </p>
        <p className="text-[1.2rem] font-bold leading-none tracking-tight text-canopy">
          {price}
        </p>
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-semibold leading-snug text-ink">
            {street}
          </p>
          <p className="truncate text-xs text-ink/55">{cityLine}</p>
        </div>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink/60">
          <span>{typeLabel}</span>
          <span className="inline-flex items-center gap-1">
            <Bed className="size-3 shrink-0" aria-hidden />
            {formatBeds(view.beds)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath className="size-3 shrink-0" aria-hidden />
            {formatBaths(view.baths)}
          </span>
        </p>
        <p className="text-[10px] font-medium tracking-wide text-ink/40">
          MLS® {view.mlsNumber}
        </p>
        <ListingLink
          href={view.href}
          className="inline-flex w-full items-center justify-center rounded-xl bg-canopy px-3 py-2 text-xs font-semibold text-white transition hover:bg-canopy-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/40"
        >
          View Property
        </ListingLink>
      </div>
    </article>
  );
}

function ListingShareFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full max-w-[min(100%,17.5rem)] rounded-2xl bg-white px-3.5 py-3 text-sm leading-5 text-ink shadow-sm ring-1 ring-canopy/10 sm:max-w-[19rem]",
        className,
      )}
      role="status"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-canopy/70">
        Shared property
      </p>
      <p className="mt-1.5 text-ink/75">{LISTING_SHARE_MESSAGE_BODY}</p>
    </div>
  );
}

/**
 * Premium MLS property card for native CHAT transcripts (agent + customer).
 * Snapshot-only — no listing fetch; photos come from validated snapshot URLs.
 */
export function ChatListingShareCard({
  payload,
  className,
}: {
  payload: unknown;
  className?: string;
}) {
  const resolved = resolveChatListingShareView(payload);
  if (resolved.kind === "share") {
    return <ListingShareCardBody view={resolved.view} className={className} />;
  }
  if (resolved.kind === "fallback") {
    return <ListingShareFallback className={className} />;
  }
  return null;
}
