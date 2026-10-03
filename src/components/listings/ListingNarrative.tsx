"use client";

import type { PropertyType } from "@prisma/client";
import { ExpandableDescription } from "@/components/listings/ExpandableDescription";
import { ListingAboutPropertyFacts } from "@/components/listings/ListingAboutPropertyFacts";
import { ListingSection } from "@/components/listings/ListingSection";
import {
  buildAboutHomePropertyFacts,
  parseListingFacts,
  stripApproxPinNote,
} from "@/lib/listings/facts";

export function ListingNarrative({
  body,
  facts,
  propertyType,
  taxes,
  taxesLabel,
  sqft,
}: {
  body: string;
  facts?: unknown;
  propertyType?: PropertyType | null;
  taxes?: number | null;
  taxesLabel?: string | null;
  sqft?: number | null;
}) {
  const cleaned = stripApproxPinNote(body);
  const propertyFacts = buildAboutHomePropertyFacts({
    facts: parseListingFacts(facts),
    propertyType,
    taxes,
    taxesLabel,
    sqft,
  });

  return (
    <ListingSection id="listing-about">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <header className="min-w-0 shrink-0 lg:max-w-[17.5rem]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
            About this home
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-ink sm:text-2xl">
            Listing description
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink/55">
            Broker remarks from the listing.
          </p>
        </header>
        <ListingAboutPropertyFacts facts={propertyFacts} />
      </div>
      {cleaned.trim() ? (
        <div className="mt-5 min-w-0">
          <ExpandableDescription text={cleaned} className="text-ink/75" />
        </div>
      ) : null}
    </ListingSection>
  );
}
