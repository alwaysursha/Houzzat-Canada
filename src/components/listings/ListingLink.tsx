"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { openListingPath } from "@/lib/listings/navigate-listing";

type ListingLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
  href: string;
};

/**
 * Link to a listing detail page that forces a full document load.
 * Avoids OpenNext soft-nav 500s on `/listing/[...parts]`.
 */
export function ListingLink({
  href,
  onClick,
  children,
  ...props
}: ListingLinkProps) {
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
    event.preventDefault();
    openListingPath(href);
  }

  return (
    <Link href={href} prefetch={false} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
