"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Narrow copy for a specific area of the product. */
  title?: string;
  className?: string;
};

export function RouteError({
  error,
  reset,
  title = "Something went wrong",
  className,
}: RouteErrorProps) {
  useEffect(() => {
    console.error("[route-error]", error.digest ?? error.message, error);
  }, [error]);

  return (
    <div
      className={cn(
        "flex min-h-[70vh] flex-col items-center justify-center bg-mist px-6 py-16 text-center",
        className,
      )}
    >
      <p className="font-display text-sm tracking-[0.14em] text-canopy uppercase">
        {SITE_NAME}
      </p>
      <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-md text-sm text-ink/60">
        Please try again. Your account and saved homes are safe — this was a
        temporary hiccup loading the page.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-canopy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-canopy/40"
        >
          Reload
        </button>
        <Link
          href="/"
          className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-canopy/40"
        >
          Home
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-8 text-xs text-ink/35">Ref {error.digest}</p>
      ) : null}
    </div>
  );
}
