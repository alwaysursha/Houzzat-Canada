"use client";

import { useState } from "react";
import { Lock, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmailVerificationRequired({
  title = "Email verification required",
  body = "Verify your email to keep full access to sold prices, saved searches, photos, and other client tools.",
  callbackUrl,
  className,
  compact = false,
  variant = "default",
  icon = "mail",
  eyebrow = "Account access",
}: {
  title?: string;
  body?: string;
  callbackUrl?: string;
  className?: string;
  /** With featured: denser card layout. With default: smaller stack. */
  compact?: boolean;
  /** Larger, polished layout for photo gates and prominent blocks. */
  variant?: "default" | "featured";
  icon?: "mail" | "lock" | "none";
  /** Featured eyebrow label. Pass null to hide. */
  eyebrow?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const featured = variant === "featured";
  const featuredCompact = featured && compact;

  async function requestEmail() {
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callbackUrl: callbackUrl?.startsWith("/") ? callbackUrl : undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        alreadyVerified?: boolean;
        emailNotConfigured?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not send verification email.");
        return;
      }
      if (data.alreadyVerified) {
        setMessage("Your email is already verified. Refresh the page.");
        return;
      }
      setMessage("Verification email sent. Check your inbox.");
    } catch {
      setError("Could not send verification email.");
    } finally {
      setPending(false);
    }
  }

  const Icon = icon === "lock" ? Lock : Mail;

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        featured
          ? cn("items-stretch text-left", featuredCompact ? "gap-4" : "gap-6")
          : cn("items-center text-center", compact ? "gap-2" : "gap-3"),
        className,
      )}
    >
      {icon !== "none" ? (
        featured ? (
          <div className="flex justify-center">
            <span
              className={cn(
                "relative inline-flex items-center justify-center bg-canopy text-white shadow-[0_12px_28px_-10px_rgba(15,61,46,0.55)]",
                featuredCompact
                  ? "size-12 rounded-xl ring-4 ring-canopy/10"
                  : "size-16 rounded-2xl ring-8 ring-canopy/10 sm:size-[4.5rem]",
              )}
            >
              <Icon
                className={featuredCompact ? "size-5" : "size-7 sm:size-8"}
                strokeWidth={2.25}
                aria-hidden
              />
            </span>
          </div>
        ) : (
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-canopy text-white shadow-sm",
              compact ? "size-9" : "size-11",
            )}
          >
            <Icon className={compact ? "size-4" : "size-5"} aria-hidden />
          </span>
        )
      ) : null}

      <div
        className={cn(
          featured
            ? cn("text-center", featuredCompact ? "space-y-1.5" : "space-y-2.5")
            : compact
              ? "space-y-1"
              : "space-y-1.5",
        )}
      >
        {featured && eyebrow ? (
          <p
            className={cn(
              "font-semibold uppercase tracking-[0.18em] text-canopy",
              featuredCompact ? "text-[10px]" : "text-[11px]",
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <p
          className={cn(
            "font-semibold text-ink",
            featured
              ? featuredCompact
                ? "font-display text-xl leading-tight"
                : "font-display text-2xl leading-tight sm:text-3xl"
              : compact
                ? "text-xs"
                : "text-sm",
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            "leading-relaxed text-ink/60",
            featured
              ? featuredCompact
                ? "text-xs"
                : "mx-auto max-w-sm text-sm sm:text-[15px]"
              : compact
                ? "text-[11px]"
                : "text-xs",
          )}
        >
          {body}
        </p>
      </div>

      <div
        className={cn(
          "flex flex-col",
          featured ? (featuredCompact ? "gap-2" : "gap-3") : "gap-2",
        )}
      >
        <button
          type="button"
          disabled={pending}
          onClick={() => void requestEmail()}
          className={cn(
            "inline-flex w-full items-center justify-center bg-canopy font-semibold text-white transition hover:bg-canopy-deep disabled:opacity-60",
            featured
              ? featuredCompact
                ? "h-11 rounded-xl px-4 text-sm shadow-[0_10px_24px_-12px_rgba(15,61,46,0.65)]"
                : "h-12 rounded-xl px-5 text-sm shadow-[0_10px_24px_-12px_rgba(15,61,46,0.65)] sm:h-14 sm:text-[15px]"
              : cn(
                  "rounded-lg",
                  compact ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm",
                ),
          )}
        >
          {pending ? "Sending…" : "Request verification email"}
        </button>
        {message ? (
          <p
            className={cn(
              "font-medium text-canopy-deep",
              featured
                ? featuredCompact
                  ? "text-center text-xs"
                  : "text-center text-sm"
                : "text-xs",
            )}
          >
            {message}
          </p>
        ) : null}
        {error ? (
          <p
            className={cn(
              "font-medium text-amber-800",
              featured
                ? featuredCompact
                  ? "text-center text-xs"
                  : "text-center text-sm"
                : "text-xs",
            )}
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
