"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
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
  appearance,
}: {
  mlsNumber: string;
  title: string;
  /** Canonical SEO path when known (`/listing/slug/MLS`). */
  path?: string;
  className?: string;
  /** Royal Collection property toolbar. Houzzat omits this. */
  appearance?: "royal";
}) {
  const siteName = useTenantDisplayName("Houzzat");
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
  const encodedTitle = encodeURIComponent(`${title} | ${siteName}`);
  const royal = appearance === "royal";

  async function openShare() {
    if (royal && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${title} | ${siteName}`, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    setShareOpen((open) => !open);
  }

  const menuItemClass = royal
    ? "flex w-full items-center gap-2 bg-white px-3 py-2 text-left text-sm font-medium text-[#071629] transition-colors hover:bg-[#071629] hover:text-[#F7F4EE]"
    : "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist";

  return (
    <div ref={menuRef} className={cn("relative", royal && shareOpen && "z-40", className)}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label="Share property"
        aria-expanded={shareOpen}
        data-rc-action={royal ? "" : undefined}
        onClick={() => void openShare()}
      >
        <Share2 className="h-4 w-4" />
        Share
      </Button>

      {shareOpen ? (
        <div
          className={cn(
            "absolute left-0 top-full z-40 mt-2 w-48 overflow-hidden border py-1",
            royal
              ? "rounded-none border-[#C8A66A] bg-white text-[#071629] shadow-[0_16px_32px_rgb(7_22_41/0.18)]"
              : "rounded-xl border-line bg-surface shadow-lg",
          )}
          data-rc-share-menu={royal ? "" : undefined}
        >
          <button
            type="button"
            onClick={() => void copyLink()}
            className={menuItemClass}
          >
            {copied ? (
              <Check className={cn("size-4", royal ? "text-[#C8A66A]" : "text-canopy")} />
            ) : (
              <Link2 className={cn("size-4", royal ? "text-[#C8A66A]" : "text-canopy")} />
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
            className={menuItemClass}
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
            className={menuItemClass}
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
            className={menuItemClass}
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
            className={menuItemClass}
          >
            WhatsApp
          </button>
        </div>
      ) : null}
    </div>
  );
}
