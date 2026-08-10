"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { LeadRequestForm } from "@/components/listings/LeadRequestForm";
import {
  defaultViewingMessage,
  type ViewingContactDefaults,
} from "@/components/listings/ViewingBookingModal";
import { RoutePlannerToggleButton } from "@/components/route-planner/RoutePlannerToggleButton";
import { cn } from "@/lib/utils";

function defaultInquiryMessage(mlsNumber: string) {
  return `I'd like details or something similar to MLS® ${mlsNumber}. Please contact me.`;
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
}) {
  const [mode, setMode] = useState<"showing" | "virtual_viewing">("showing");
  const watchSegment =
    segment === "COMMERCIAL" ? "COMMERCIAL" : ("RESIDENTIAL" as const);
  const similarHref =
    similarHomesHref ??
    `/search?status=ACTIVE&city=${encodeURIComponent(city ?? "")}`;
  const authCallbackUrl = callbackPath ?? `/listing/${mlsNumber}`;

  const shellClass = cn(
    // Parent column must be the tall grid aside — do not wrap this in a short
    // div, or sticky has no room to travel.
    // Sit just under site header + listing action bar (header stack is 0 in sheet).
    "sticky top-[calc(var(--site-header-stack,4rem)+var(--listing-sticky-bar-height,5.5rem)+0.5rem)] z-10 rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-6",
    className,
  );

  if (inactive) {
    return (
      <div className={shellClass}>
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
            mlsNumber={mlsNumber}
            kind="inquiry"
            defaults={{
              name: contact?.name ?? "",
              email: contact?.email ?? "",
              phone: contact?.phone ?? "",
              message: defaultInquiryMessage(mlsNumber),
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
    <div className={shellClass}>
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
            mode === "showing"
              ? "bg-canopy text-white shadow-sm"
              : "border border-line/70 bg-mist/40 text-ink/70"
          }`}
          onClick={() => setMode("showing")}
        >
          In-person
        </button>
        <button
          type="button"
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            mode === "virtual_viewing"
              ? "bg-signal text-white shadow-sm"
              : "border border-line/70 bg-mist/40 text-ink/70"
          }`}
          onClick={() => setMode("virtual_viewing")}
        >
          Virtual Viewing
        </button>
      </div>
      <div className="mt-4">
        <LeadRequestForm
          key={mode}
          mlsNumber={mlsNumber}
          kind={mode}
          defaults={{
            name: contact?.name ?? "",
            email: contact?.email ?? "",
            phone: contact?.phone ?? "",
            message: defaultViewingMessage(mlsNumber, mode),
          }}
        />
      </div>
    </div>
  );
}
