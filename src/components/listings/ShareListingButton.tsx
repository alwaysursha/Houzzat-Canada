"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

function listingUrl(mlsNumber: string, path?: string) {
  const relative = path ?? `/listing/${mlsNumber}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${relative}`;
  }
  return relative;
}

export function ShareListingButton({
  mlsNumber,
  title,
  path,
  className,
}: {
  mlsNumber: string;
  title: string;
  /** Canonical SEO path when known (`/listing/slug/MLS`). */
  path?: string;
  className?: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  async function copyLink() {
    const shareUrl = listingUrl(mlsNumber, path);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard errors.
    }
  }

  function openNetwork(href: string) {
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=560");
    setShareOpen(false);
  }

  const url = listingUrl(mlsNumber, path);
  const encoded = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(`${title} | ${SITE_NAME}`);

  return (
    <div ref={menuRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label="Share property"
        aria-expanded={shareOpen}
        onClick={() => setShareOpen((open) => !open)}
      >
        <Share2 className="h-4 w-4" />
        Share
      </Button>

      {shareOpen ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          <button
            type="button"
            onClick={() => void copyLink()}
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
            onClick={() =>
              openNetwork(
                `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
              )
            }
            className="flex w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
          >
            Facebook
          </button>
          <button
            type="button"
            onClick={() =>
              openNetwork(
                `https://twitter.com/intent/tweet?url=${encoded}&text=${encodedTitle}`,
              )
            }
            className="flex w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
          >
            X
          </button>
          <button
            type="button"
            onClick={() =>
              openNetwork(
                `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
              )
            }
            className="flex w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
          >
            LinkedIn
          </button>
          <button
            type="button"
            onClick={() =>
              openNetwork(
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
  );
}
