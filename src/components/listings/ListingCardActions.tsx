"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Check, Heart, Link2, Share2 } from "lucide-react";
import { useSavedListingToggle } from "@/components/account/useSavedListingToggle";
import { RoutePlannerToggleButton } from "@/components/route-planner/RoutePlannerToggleButton";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { cn } from "@/lib/utils";

function listingUrl(mlsNumber: string, path?: string) {
  const relative = path ?? `/listing/${mlsNumber}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${relative}`;
  }
  return relative;
}

export function ListingCardActions({
  mlsNumber,
  title,
  listingStatus,
  path,
  className,
}: {
  mlsNumber: string;
  title: string;
  listingStatus?: string;
  /** Canonical SEO path when known (`/listing/slug/MLS`). */
  path?: string;
  className?: string;
}) {
  const siteName = useTenantDisplayName("Houzzat");
  const { saved, pending, ready, toggle } = useSavedListingToggle({
    mlsNumber,
    authCallbackUrl: path ?? `/listing/${mlsNumber}`,
  });
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShareOpen(false);
      }
    }
    if (shareOpen) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [shareOpen]);

  async function toggleSave(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    await toggle({ flyFrom: saveButtonRef.current });
  }

  function toggleShareMenu(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setShareOpen((open) => !open);
  }

  async function copyLink(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const shareUrl = listingUrl(mlsNumber, path);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard errors.
    }
  }

  function openNetwork(event: ReactMouseEvent, href: string) {
    event.preventDefault();
    event.stopPropagation();
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=560");
    setShareOpen(false);
  }

  const url = listingUrl(mlsNumber, path);
  const encoded = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(`${title} | ${siteName}`);

  return (
    <div
      ref={menuRef}
      className={cn("flex items-center gap-1.5", className)}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={saveButtonRef}
        type="button"
        aria-label={saved ? "Remove saved property" : "Save property"}
        aria-busy={pending || !ready}
        disabled={pending || !ready}
        onClick={toggleSave}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-lg border border-line bg-mist text-ink transition hover:border-canopy/40 hover:bg-canopy/5",
          saved && "border-canopy/40 bg-canopy/10 text-canopy",
        )}
      >
        <Heart
          className={cn("size-4", saved && "fill-canopy text-canopy")}
          strokeWidth={2.25}
        />
      </button>

      <RoutePlannerToggleButton
        mlsNumber={mlsNumber}
        listingStatus={listingStatus}
      />

      <div className="relative">
        <button
          type="button"
          aria-label="Share property"
          aria-expanded={shareOpen}
          onClick={toggleShareMenu}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-mist text-ink transition hover:border-canopy/40 hover:bg-canopy/5"
        >
          <Share2 className="size-4" strokeWidth={2.25} />
        </button>

        {shareOpen ? (
          <div className="absolute left-0 bottom-full z-20 mb-2 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
            <button
              type="button"
              onClick={copyLink}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
            >
              {copied ? (
                <Check className="size-4 text-canopy" />
              ) : (
                <Link2 className="size-4 text-canopy" />
              )}
              {copied ? "Link copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={(event) =>
                openNetwork(
                  event,
                  `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
                )
              }
              className="flex w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
            >
              Facebook
            </button>
            <button
              type="button"
              onClick={(event) =>
                openNetwork(
                  event,
                  `https://twitter.com/intent/tweet?url=${encoded}&text=${encodedTitle}`,
                )
              }
              className="flex w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
            >
              X
            </button>
            <button
              type="button"
              onClick={(event) =>
                openNetwork(
                  event,
                  `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
                )
              }
              className="flex w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
            >
              LinkedIn
            </button>
            <button
              type="button"
              onClick={(event) =>
                openNetwork(
                  event,
                  `https://wa.me/?text=${encodedTitle}%20${encoded}`,
                )
              }
              className="flex w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
            >
              WhatsApp
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
