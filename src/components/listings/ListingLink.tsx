"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import {
  mlsNumberFromListingHref,
  prefetchListingGallery,
} from "@/lib/listings/gallery-client";
import { openListingPath } from "@/lib/listings/navigate-listing";

type ListingLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
  href: string;
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
  children,
  ...props
}: ListingLinkProps) {
  function warmGallery() {
    const mls = mlsNumberFromListingHref(href);
    if (mls) prefetchListingGallery(mls);
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // Allow modified clicks (new tab / download) to use the real href.
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
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
