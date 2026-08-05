"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { ListingSection } from "@/components/listings/ListingSection";
import { cn } from "@/lib/utils";

export function ListingNotesPanel({
  mlsNumber,
  signedIn,
  initialBody = "",
  className,
  embedded = false,
  authCallbackUrl,
}: {
  mlsNumber: string;
  signedIn: boolean;
  initialBody?: string;
  className?: string;
  /** Skip outer section chrome (for mobile drawer). */
  embedded?: boolean;
  authCallbackUrl?: string;
}) {
  const { openAuth } = useAuthModal();
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);
  const callbackUrl = authCallbackUrl ?? `/listing/${mlsNumber}`;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/account/notes/${encodeURIComponent(mlsNumber)}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { body?: string };
      setBody(data.body ?? "");
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [mlsNumber, signedIn]);

  function scheduleSave(next: string) {
    if (!signedIn) return;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (async () => {
        const res = await fetch(
          `/api/account/notes/${encodeURIComponent(mlsNumber)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: next }),
          },
        );
        setStatus(res.ok ? "saved" : "error");
      })();
    }, 600);
  }

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Couldn’t save"
          : "Private";

  if (!signedIn) {
    const signIn = (
      <button
        type="button"
        className="rounded-lg bg-canopy/10 px-3 py-2 text-sm font-semibold text-canopy transition hover:bg-canopy/15"
        onClick={() =>
          openAuth({
            mode: "sign-in",
            callbackUrl,
          })
        }
      >
        Sign in to take notes →
      </button>
    );

    if (embedded) {
      return (
        <div className={cn("space-y-3", className)}>
          <p className="text-sm text-ink/55">
            Sign in to keep private notes on this home.
          </p>
          {signIn}
        </div>
      );
    }

    return (
      <ListingSection
        eyebrow="Private"
        title="Your notes"
        hint="Sign in to keep private notes on this home. View them anytime in your dashboard."
        className={className}
      >
        {signIn}
      </ListingSection>
    );
  }

  const editor = (
    <>
      {embedded ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs text-ink/50">
            View all in your{" "}
            <Link
              href="/account/notes"
              className="font-semibold text-canopy hover:underline"
            >
              dashboard
            </Link>
            .
          </p>
          <span className="text-xs font-medium text-ink/45">{statusLabel}</span>
        </div>
      ) : null}
      <textarea
        className="min-h-32 w-full rounded-xl border border-line/70 bg-mist/40 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-canopy/50"
        placeholder="Showing notes, offer ideas, questions for your agent…"
        value={body}
        onChange={(e) => {
          const next = e.target.value;
          setBody(next);
          if (hydrated.current || next !== initialBody) {
            scheduleSave(next);
          }
        }}
      />
    </>
  );

  if (embedded) {
    return <div className={cn(className)}>{editor}</div>;
  }

  return (
    <ListingSection
      eyebrow="Private"
      title="Your notes"
      className={cn(className)}
      hint={
        <>
          View all your notes in your{" "}
          <Link
            href="/account/notes"
            className="font-semibold text-canopy hover:underline"
          >
            dashboard
          </Link>
          .
        </>
      }
      action={
        <span className="text-xs font-medium text-ink/45">{statusLabel}</span>
      }
    >
      {editor}
    </ListingSection>
  );
}
