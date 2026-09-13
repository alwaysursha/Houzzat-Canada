"use client";

import { Lock } from "lucide-react";
import { useClientToolsVerification } from "@/components/auth/ClientToolsVerificationProvider";
import { GALLERY_VERIFY_COPY } from "@/lib/account-access";
import { cn } from "@/lib/utils";

export function GalleryVerifyLockCard({
  callbackUrl,
  compact = false,
  className,
}: {
  callbackUrl: string;
  /** Dense layout for a cover-grid tile or mobile snap slide. */
  compact?: boolean;
  className?: string;
}) {
  const { openClientToolsVerification } = useClientToolsVerification();

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center bg-mist px-3 text-center",
        compact ? "gap-1.5 py-3 sm:px-3" : "gap-3 px-4 py-6 sm:px-6",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-canopy text-white shadow-sm",
          compact ? "size-8" : "size-10",
        )}
      >
        <Lock className={compact ? "size-3.5" : "size-5"} aria-hidden />
      </span>
      <p
        className={cn(
          "font-semibold text-ink",
          compact ? "text-xs leading-snug sm:text-sm" : "font-display text-lg sm:text-xl",
        )}
      >
        {GALLERY_VERIFY_COPY.title}
      </p>
      <p
        className={cn(
          "max-w-md leading-snug text-ink/60",
          compact ? "line-clamp-4 text-[11px]" : "text-sm leading-relaxed",
        )}
      >
        {GALLERY_VERIFY_COPY.body}
      </p>
      <button
        type="button"
        onClick={() =>
          openClientToolsVerification({ callbackUrl })
        }
        className={cn(
          "inline-flex items-center justify-center rounded-xl bg-canopy font-semibold text-white transition hover:bg-canopy-deep",
          compact
            ? "min-h-8 px-3 py-1.5 text-xs"
            : "min-h-11 px-4 py-2.5 text-sm",
        )}
      >
        {GALLERY_VERIFY_COPY.ctaLabel}
      </button>
    </div>
  );
}
