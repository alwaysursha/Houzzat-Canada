"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListingDetailView } from "@/components/listings/ListingDetailView";
import type { ListingPanelErrorBody } from "@/lib/listings/build-listing-panel";
import { fetchListingPanel } from "@/lib/listings/fetch-listing-panel";
import { mlsNumberFromListingHref } from "@/lib/listings/gallery-client";
import { panelPayloadToDetailViewProps } from "@/lib/listings/map-panel-to-detail-view";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; props: ReturnType<typeof panelPayloadToDetailViewProps> }
  | { status: "error"; httpStatus: number; body: ListingPanelErrorBody };

/**
 * In-app listing detail (no iframe). Fetches GET /api/listings/[mls]/panel
 * and renders the shared ListingDetailView. Used by ListingSheetHost when the
 * internal listingPanel flag is on — production default remains the iframe.
 */
export function ListingDetailPanel({ href }: { href: string }) {
  const mlsNumber = mlsNumberFromListingHref(href);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!mlsNumber) {
      setState({
        status: "error",
        httpStatus: 400,
        body: { error: "Missing MLS number" },
      });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    void (async () => {
      const result = await fetchListingPanel(mlsNumber, {
        signal: controller.signal,
      });
      if (cancelled) return;
      if (!result.ok) {
        setState({
          status: "error",
          httpStatus: result.status,
          body: result.body ?? {
            error: result.error,
            vowBlocked: result.status === 401 || result.status === 403,
            requiresAuth: result.status === 401,
            requiresEmailVerification: result.status === 403,
          },
        });
        return;
      }
      setState({
        status: "ready",
        props: panelPayloadToDetailViewProps(result.data),
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mlsNumber]);

  if (state.status === "loading") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgb(244_247_245)_0%,rgb(255_255_255)_28%,rgb(255_255_255)_100%)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="space-y-4" aria-busy="true" aria-label="Loading listing">
          <div className="aspect-[16/10] w-full animate-pulse rounded-2xl bg-mist" />
          <div className="h-10 w-48 animate-pulse rounded-lg bg-mist" />
          <div className="h-6 w-72 animate-pulse rounded-lg bg-mist" />
          <div className="grid grid-cols-4 gap-2 md:flex md:gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-16 min-w-[5.25rem] animate-pulse rounded-xl bg-mist"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    const callback = href.split("?")[0] || "/";
    const signInHref = `/auth/sign-in?callbackUrl=${encodeURIComponent(callback)}`;
    const verifyHref = `/auth/verify-email?callbackUrl=${encodeURIComponent(callback)}`;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto bg-mist px-6 py-12 text-center">
        <p className="font-display text-xl text-ink">
          {state.body.requiresEmailVerification
            ? "Email verification required"
            : state.body.requiresAuth || state.body.vowBlocked
              ? "Sign in required"
              : "Listing unavailable"}
        </p>
        <p className="max-w-sm text-sm text-ink/60">
          {state.body.error || "This listing could not be loaded."}
        </p>
        {state.body.requiresEmailVerification ? (
          <Link
            href={verifyHref}
            className="rounded-xl bg-canopy px-4 py-2.5 text-sm font-semibold text-white"
          >
            Verify email
          </Link>
        ) : state.body.requiresAuth || state.body.vowBlocked ? (
          <Link
            href={signInHref}
            className="rounded-xl bg-canopy px-4 py-2.5 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
        ) : (
          <Link
            href={callback}
            className="text-sm font-semibold text-canopy hover:underline"
          >
            Open listing page
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <ListingDetailView
        {...state.props}
        applyDocumentSheetFlags={false}
      />
    </div>
  );
}
