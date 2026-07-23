"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthModal } from "@/components/auth/AuthModalProvider";

export function ListingNotesPanel({
  mlsNumber,
  signedIn,
  initialBody = "",
}: {
  mlsNumber: string;
  signedIn: boolean;
  initialBody?: string;
}) {
  const { openAuth } = useAuthModal();
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

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

  if (!signedIn) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">Your notes</h2>
        <p className="mt-2 text-sm text-ink/60">
          Sign in to keep private notes on this home. You can view all of them
          anytime in your dashboard.
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-canopy"
          onClick={() =>
            openAuth({
              mode: "sign-in",
              callbackUrl: `/listing/${mlsNumber}`,
            })
          }
        >
          Sign in to take notes →
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Your notes</h2>
        <span className="text-xs text-ink/45">
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved"
              : status === "error"
                ? "Couldn’t save"
                : "Private"}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink/60">
        View all your notes in your{" "}
        <Link
          href="/account/notes"
          className="font-semibold text-canopy hover:underline"
        >
          dashboard
        </Link>
        .
      </p>
      <textarea
        className="mt-3 min-h-32 w-full rounded-xl border border-line bg-mist/40 px-3 py-2 text-sm text-ink outline-none focus:border-canopy/50"
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
    </section>
  );
}
