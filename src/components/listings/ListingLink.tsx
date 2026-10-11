"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { reportPropertyCardClicked } from "@/lib/funnel/browser";
import { resolveListingLinkClickAction } from "@/lib/funnel/client-signals";
import {
  mlsNumberFromListingHref,
  prefetchListingGallery,
} from "@/lib/listings/gallery-client";
import { openListingPath } from "@/lib/listings/navigate-listing";

type ListingLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
  href: string;
  /** Optional funnel pathClass (search_card, map_card, compact_card, …). */
  funnelPathClass?: string;
};

/**
 * Link to a listing detail page — opens the full listing overlay sheet
 * (same detail page, keeps browse mounted; avoids soft-nav remounts).
 */
export function ListingLink({
  href,
  onClick,
  onPointerEnter,
  onFocus,
  funnelPathClass,
  children,
  ...props
}: ListingLinkProps) {
  function warmGallery() {
    const mls = mlsNumberFromListingHref(href);
    if (mls) prefetchListingGallery(mls);
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    const action = resolveListingLinkClickAction({
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      button: event.button,
      defaultPrevented: event.defaultPrevented,
    });
    if (action.trackCardClick) {
      reportPropertyCardClicked(href, {
        source: "listing_link",
        ...(funnelPathClass ? { pathClass: funnelPathClass } : {}),
      });
    }
    if (!action.openOverlay) return;
    // Start gallery fetch before the sheet iframe mounts.
    warmGallery();
    event.preventDefault();
    openListingPath(href);
  }

  return (
    <Link
      href={href}
      prefetch={false}
      onClick={handleClick}
      onPointerEnter={(event) => {
        warmGallery();
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        warmGallery();
        onFocus?.(event);
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
