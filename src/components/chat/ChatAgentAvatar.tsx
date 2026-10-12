"use client";

import { cn } from "@/lib/utils";

/**
 * Circular agent portrait. object-position top-center keeps heads in frame
 * for common tall headshot crops without stretching.
 */
export function ChatAgentAvatar({
  name,
  initials,
  photoUrl,
  size = "md",
  className,
}: {
  name: string;
  initials: string;
  photoUrl: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "sm" ? "size-8 text-[11px]" : size === "lg" ? "size-12 text-[14px]" : "size-11 text-[13px]";

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- workspace branding CDN URLs vary by tenant
      <img
        src={photoUrl}
        alt={name}
        className={cn(
          "shrink-0 rounded-full object-cover object-[center_18%] ring-2 ring-[#d7e8df]",
          sizeClass,
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[#0f6b4c] font-bold text-white shadow-sm",
        sizeClass,
        className,
      )}
    >
      {initials}
    </span>
  );
}
