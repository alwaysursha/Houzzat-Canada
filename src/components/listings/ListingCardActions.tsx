"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useSession } from "next-auth/react";
import { Check, Heart, Link2, Share2 } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

function listingUrl(mlsNumber: string) {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/listing/${mlsNumber}`;
  }
  return `/listing/${mlsNumber}`;
}

export function ListingCardActions({
  mlsNumber,
  title,
  className,
}: {
  mlsNumber: string;
  title: string;
  className?: string;
}) {
  const { status } = useSession();
  const { openAuth } = useAuthModal();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setSaved(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `/api/saved-listings?mlsNumber=${encodeURIComponent(mlsNumber)}`,
      );
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { saved?: boolean };
      if (!cancelled) setSaved(Boolean(data.saved));
    })();
    return () => {
      cancelled = true;
    };
  }, [status, mlsNumber]);

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

    if (status !== "authenticated") {
      openAuth({
        mode: "sign-in",
        callbackUrl: `/listing/${mlsNumber}`,
      });
      return;
    }

    setPending(true);
    const res = await fetch("/api/saved-listings", {
      method: saved ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    setPending(false);
    if (!res.ok) return;
    setSaved(!saved);
  }

  async function shareNative(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const shareUrl = listingUrl(mlsNumber);
    const shareData = {
      title: `${title} | ${SITE_NAME}`,
      text: `Check out this property on ${SITE_NAME}`,
      url: shareUrl,
    };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share failed — fall through to menu.
      }
    }
    setShareOpen((open) => !open);
  }

  async function copyLink(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const shareUrl = listingUrl(mlsNumber);
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

  const url = listingUrl(mlsNumber);
  const encoded = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(`${title} | ${SITE_NAME}`);

  return (
    <div
      ref={menuRef}
      className={cn("flex items-center gap-1.5", className)}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={saved ? "Remove saved property" : "Save property"}
        disabled={pending}
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

      <div className="relative">
        <button
          type="button"
          aria-label="Share property"
          aria-expanded={shareOpen}
          onClick={shareNative}
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
                openNetwork(event, `https://wa.me/?text=${encodedTitle}%20${encoded}`)
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
