"use client";

import { useEffect, useState } from "react";
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
  /** Prefill when parent already knows the email. */
  initialEmail,
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
  initialEmail?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [email, setEmail] = useState(initialEmail?.trim() ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const featured = variant === "featured";
  const featuredCompact = featured && compact;

  useEffect(() => {
    if (initialEmail?.trim()) {
      setEmail(initialEmail.trim());
      return;
    }
    let cancelled = false;
    void fetch("/api/account/access")
      .then((res) => res.json())
      .then((data: unknown) => {
        const json = data as { email?: string | null };
        if (!cancelled && json.email) setEmail(json.email);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialEmail]);

  async function saveEmailIfChanged(current: string) {
    const next = current.trim().toLowerCase();
    if (!next || !next.includes("@")) {
      throw new Error("Enter a valid email address.");
    }
    if (initialEmail && next === initialEmail.trim().toLowerCase()) {
      return next;
    }
    // Compare against loaded email — always PATCH so profile stays in sync
    // when the user edits before sending.
    const res = await fetch("/api/account/contact", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: next }),
    });
    const data = (await res.json()) as { error?: string; email?: string };
    if (!res.ok) {
      throw new Error(data.error ?? "Could not update email.");
    }
    return data.email ?? next;
  }

  async function requestEmail() {
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      setSavingEmail(true);
      const finalEmail = await saveEmailIfChanged(email);
      setEmail(finalEmail);
      setSavingEmail(false);

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
      setMessage(`Verification email sent to ${finalEmail}. Check your inbox.`);
    } catch (err) {
      setSavingEmail(false);
      setError(err instanceof Error ? err.message : "Could not send verification email.");
    } finally {
      setPending(false);
      setSavingEmail(false);
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
                ? "font-display text-xl leading-snug"
                : "font-display text-2xl leading-snug sm:text-3xl"
              : compact
                ? "text-xs"
                : "text-sm",
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            "leading-relaxed text-ink/60 break-words",
            featured
              ? featuredCompact
                ? "text-[13px] sm:text-sm"
                : "mx-auto max-w-prose text-sm sm:text-[15px]"
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
        <label className="block text-left">
          <span
            className={cn(
              "mb-1 block font-semibold text-ink/55",
              featuredCompact ? "text-[10px] uppercase tracking-wide" : "text-xs",
            )}
          >
            Email
          </span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={cn(
              "w-full rounded-xl border border-line bg-mist/40 text-ink outline-none transition focus:border-canopy focus:ring-2 focus:ring-canopy/20",
              featuredCompact
                ? "h-10 px-3 text-sm"
                : "h-11 px-3.5 text-sm sm:h-12",
            )}
          />
        </label>

        <button
          type="button"
          disabled={pending || savingEmail || !email.trim()}
          onClick={() => void requestEmail()}
          className={cn(
            "inline-flex w-full items-center justify-center whitespace-normal bg-canopy text-center font-semibold text-white transition hover:bg-canopy-deep disabled:opacity-60",
            featured
              ? featuredCompact
                ? "min-h-11 rounded-xl px-4 py-2.5 text-sm shadow-[0_10px_24px_-12px_rgba(15,61,46,0.65)]"
                : "min-h-12 rounded-xl px-5 py-3 text-sm shadow-[0_10px_24px_-12px_rgba(15,61,46,0.65)] sm:min-h-14 sm:text-[15px]"
              : cn(
                  "rounded-lg",
                  compact
                    ? "min-h-9 px-3 py-2 text-xs"
                    : "min-h-10 px-4 py-2 text-sm",
                ),
          )}
        >
          {pending || savingEmail ? "Sending…" : "Send verification link"}
        </button>
        {message ? (
          <p
            className={cn(
              "font-medium text-canopy-deep break-words",
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
              "font-medium text-amber-800 break-words",
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
