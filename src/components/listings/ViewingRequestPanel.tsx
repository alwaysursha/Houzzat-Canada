"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Search } from "lucide-react";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { useListingContactDefaults } from "@/components/listings/ListingAccountChromeProvider";
import { LeadRequestForm } from "@/components/listings/LeadRequestForm";
import { useLeadRequestRestore } from "@/components/listings/useLeadRequestRestore";
import {
  defaultViewingMessage,
  type ViewingContactDefaults,
} from "@/components/listings/ViewingBookingModal";
import { RoutePlannerToggleButton } from "@/components/route-planner/RoutePlannerToggleButton";
import { cn } from "@/lib/utils";

function defaultInquiryMessage(mlsNumber: string) {
  return `I'd like details or something similar to MLS® ${mlsNumber}. Please contact me.`;
}

function useListingViewport(): "unknown" | "narrow" | "wide" {
  const [viewport, setViewport] = useState<"unknown" | "narrow" | "wide">(
    "unknown",
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setViewport(media.matches ? "narrow" : "wide");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return viewport;
}

export function ViewingRequestPanel({
  mlsNumber,
  callbackPath,
  contact,
  inactive = false,
  similarHomesHref,
  city,
  community,
  transactionType = "SALE",
  segment,
  signedIn = false,
  className,
  claimRestore = "auto",
}: {
  mlsNumber: string;
  /** Canonical SEO path for auth redirects. */
  callbackPath?: string;
  contact?: ViewingContactDefaults;
  inactive?: boolean;
  similarHomesHref?: string;
  city?: string;
  community?: string | null;
  transactionType?: "SALE" | "LEASE";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | string;
  signedIn?: boolean;
  className?: string;
  /**
   * auto: the desktop panel claims the restore. The mobile booking sheet does.
   * always: this panel is the visible form at every width (map overlay).
   */
  claimRestore?: "auto" | "always";
}) {
  const viewport = useListingViewport();
  const { status } = useSession();
  const narrow = viewport === "narrow";
  const claim =
    claimRestore === "always" || inactive || viewport === "wide";
  const restore = useLeadRequestRestore(mlsNumber, claim);
  const [mode, setMode] = useState<"showing" | "virtual_viewing">("showing");
  const [modeChosen, setModeChosen] = useState(false);
  const resolvedContact = useListingContactDefaults(contact);
  const watchSegment =
    segment === "COMMERCIAL" ? "COMMERCIAL" : ("RESIDENTIAL" as const);
  const similarHref =
    similarHomesHref ??
    `/search?status=ACTIVE&city=${encodeURIComponent(city ?? "")}`;
  const authCallbackUrl = callbackPath ?? `/listing/${mlsNumber}`;

  const restoredViewing =
    !modeChosen &&
    (restore?.kind === "showing" || restore?.kind === "virtual_viewing")
      ? restore.kind
      : mode;
  const showInquiryOnMobile = narrow && restore?.kind === "inquiry";
  const shellClass = cn(
    // Parent column must be the tall grid aside — do not wrap this in a short
    // div, or sticky has no room to travel.
    // Sit just under site header + listing action bar.
    // Sheet/panel sets --site-header-stack and --listing-viewing-sticky-gap to 0
    // so this docks flush under the Share/Save bar (no phantom header gap).
    "sticky top-[calc(var(--site-header-stack,4rem)+var(--listing-sticky-bar-height,5.5rem)+var(--listing-viewing-sticky-gap,0.5rem))] z-10 rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-6",
    className,
  );
  const shellStyle = showInquiryOnMobile ? { display: "block" as const } : undefined;

  if (inactive) {
    return (
      <div className={shellClass} style={shellStyle}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
          Next step
        </p>
        <h2 className="mt-1 font-display text-xl text-ink sm:text-2xl">
          Ask about this home
        </h2>
        <p className="mt-1.5 text-sm text-ink/60">
          This listing is no longer active. Send an inquiry and we’ll help with
          details or similar homes nearby.
        </p>
        <div className="mt-4">
          <LeadRequestForm
            key={`${status}-${restore?.kind === "inquiry" ? restore.restoredAt : "inquiry"}`}
            mlsNumber={mlsNumber}
            kind="inquiry"
            callbackPath={authCallbackUrl}
            defaults={{
              name: resolvedContact?.name ?? "",
              email: resolvedContact?.email ?? "",
              phone: resolvedContact?.phone ?? "",
              message:
                restore?.kind === "inquiry" && restore.message
                  ? restore.message
                  : defaultInquiryMessage(mlsNumber),
            }}
          />
        </div>
        <div className="mt-5 space-y-2 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
            Or continue browsing
          </p>
          {city ? (
            <div className="[&_button]:h-11 [&_button]:w-full [&_button]:justify-center">
              <WatchAreaButton
                city={city}
                community={community ?? undefined}
                transactionType={transactionType}
                segment={watchSegment}
                signedIn={signedIn}
                idleLabel="Watch this area"
                authCallbackUrl={authCallbackUrl}
              />
            </div>
          ) : null}
          <Link
            href={similarHref}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-mist px-4 text-sm font-semibold text-ink transition hover:border-canopy/40"
          >
            <Search className="size-4" aria-hidden />
            Find similar homes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} style={shellStyle}>
      <div className="mb-4">
        <RoutePlannerToggleButton
          mlsNumber={mlsNumber}
          listingStatus="ACTIVE"
          size="button"
        />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
        Next step
      </p>
      <h2 className="mt-1 font-display text-xl text-ink sm:text-2xl">
        Book a viewing
      </h2>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            restoredViewing === "showing"
              ? "bg-canopy text-white shadow-sm"
              : "border border-line/70 bg-mist/40 text-ink/70"
          }`}
          onClick={() => {
            setModeChosen(true);
            setMode("showing");
          }}
        >
          In-person
        </button>
        <button
          type="button"
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            restoredViewing === "virtual_viewing"
              ? "bg-signal text-white shadow-sm"
              : "border border-line/70 bg-mist/40 text-ink/70"
          }`}
          onClick={() => {
            setModeChosen(true);
            setMode("virtual_viewing");
          }}
        >
          Virtual Viewing
        </button>
      </div>
      <div className="mt-4">
        <LeadRequestForm
          key={`${status}-${restoredViewing}-${restore?.restoredAt ?? "base"}`}
          mlsNumber={mlsNumber}
          kind={restoredViewing}
          callbackPath={authCallbackUrl}
          defaults={{
            name: resolvedContact?.name ?? "",
            email: resolvedContact?.email ?? "",
            phone: resolvedContact?.phone ?? "",
            message:
              restore &&
              restore.kind === restoredViewing &&
              restore.message
                ? restore.message
                : defaultViewingMessage(mlsNumber, restoredViewing),
            focusNotes:
              restore?.kind === "virtual_viewing" &&
              restoredViewing === "virtual_viewing"
                ? (restore.focusNotes ?? "")
                : "",
          }}
        />
      </div>
    </div>
  );
}
