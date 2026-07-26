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

function defaultInquiryMessage(mlsNumber: string) {
  return `I'd like details or something similar to MLS® ${mlsNumber}. Please contact me.`;
}

export function ViewingRequestPanel({
  mlsNumber,
  contact,
  inactive = false,
  similarHomesHref,
  city,
  community,
  transactionType = "SALE",
  segment,
  signedIn = false,
}: {
  mlsNumber: string;
  contact?: ViewingContactDefaults;
  inactive?: boolean;
  similarHomesHref?: string;
  city?: string;
  community?: string | null;
  transactionType?: "SALE" | "LEASE";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | string;
  signedIn?: boolean;
}) {
  const [mode, setMode] = useState<"showing" | "virtual_viewing">("showing");
  const watchSegment =
    segment === "COMMERCIAL" ? "COMMERCIAL" : ("RESIDENTIAL" as const);
  const similarHref =
    similarHomesHref ??
    `/search?status=ACTIVE&city=${encodeURIComponent(city ?? "")}`;

  if (inactive) {
    return (
      <div className="sticky top-[calc(4rem+var(--listing-sticky-bar-height,5.5rem)+0.5rem)] z-10 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-semibold text-ink">Ask about this home</h2>
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
                authCallbackUrl={`/listing/${mlsNumber}`}
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
    <div className="sticky top-[calc(4rem+var(--listing-sticky-bar-height,5.5rem)+0.5rem)] z-10 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4">
        <RoutePlannerToggleButton
          mlsNumber={mlsNumber}
          listingStatus="ACTIVE"
          size="button"
        />
      </div>
      <h2 className="font-semibold text-ink">Book a viewing</h2>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "showing"
              ? "bg-canopy text-white"
              : "border border-line text-ink/70"
          }`}
          onClick={() => setMode("showing")}
        >
          In-person
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "virtual_viewing"
              ? "bg-signal text-white"
              : "border border-line text-ink/70"
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
