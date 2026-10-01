"use client";

import { useState } from "react";
import Link from "next/link";
import { ListingSection } from "@/components/listings/ListingSection";
import {
  buildListingFactSections,
  parseListingFacts,
  type ListingFactSection,
  type ListingFacts,
} from "@/lib/listings/facts";

/**
 * Existing row labels, in display order. A row appears only when
 * buildListingFactSections already produced it.
 * Year built and approx. age are both included when each row exists.
 */
const HIGHLIGHT_LABELS = [
  "Property type",
  "Bedrooms",
  "Bathrooms",
  "Living area",
  "Parking spaces",
  "Taxes",
  "Year built",
  "Approx. age",
  "Basement",
  "Garage",
] as const;

type FactRow = ListingFactSection["rows"][number] & { sectionId: string };

function highlightRows(sections: ListingFactSection[]): FactRow[] {
  const byLabel = new Map<string, FactRow>();
  for (const section of sections) {
    for (const row of section.rows) {
      if (!byLabel.has(row.label)) {
        byLabel.set(row.label, { ...row, sectionId: section.id });
      }
    }
  }
  return HIGHLIGHT_LABELS.flatMap((label) => {
    const row = byLabel.get(label);
    return row ? [row] : [];
  });
}

function rowCount(sections: ListingFactSection[]): number {
  return sections.reduce((count, section) => count + section.rows.length, 0);
}

function FactValue({ row }: { row: { label: string; value: string } }) {
  if (row.label === "Virtual tour") {
    return (
      <Link
        href={row.value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-canopy hover:underline"
      >
        Open tour
      </Link>
    );
  }
  return row.value;
}

export function ListingFactsPanel({
  facts,
  propertyTypeLabel,
  mlsNumber,
  community,
  postalCode,
  taxesLabel,
  maintenanceLabel,
  parkingSpaces,
  yearBuilt,
  sqftLabel,
  daysOnMarket,
  brokerageName,
  beds,
  baths,
}: {
  facts?: unknown;
  propertyTypeLabel?: string | null;
  mlsNumber?: string | null;
  community?: string | null;
  postalCode?: string | null;
  taxesLabel?: string | null;
  maintenanceLabel?: string | null;
  parkingSpaces?: number | null;
  yearBuilt?: number | null;
  sqftLabel?: string | null;
  daysOnMarket?: number | null;
  brokerageName?: string | null;
  beds?: number | null;
  baths?: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const parsed: ListingFacts | null = parseListingFacts(facts);
  const sections = buildListingFactSections({
    facts: parsed,
    propertyTypeLabel,
    mlsNumber,
    community,
    postalCode,
    taxesLabel,
    maintenanceLabel,
    parkingSpaces,
    yearBuilt,
    sqftLabel,
    daysOnMarket,
    brokerageName,
    beds,
    baths,
  });

  if (!sections.length) return null;

  const highlights = highlightRows(sections);
  const hiddenCount = rowCount(sections) - highlights.length;
  const showToggle = highlights.length > 0 && hiddenCount > 0;
  const virtualTour = parsed?.virtualTourUrl?.trim() || null;

  return (
    <ListingSection
      id="listing-details"
      title="Property details"
      action={
        virtualTour ? (
          <Link
            href={virtualTour}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg bg-canopy/10 px-3 text-xs font-semibold text-canopy transition hover:bg-canopy/15"
          >
            Virtual tour
          </Link>
        ) : null
      }
    >
      {expanded || highlights.length === 0 ? (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.id} className="space-y-3">
              <h3 className="font-sans text-sm font-semibold text-ink/70">
                {section.title}
              </h3>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                {section.rows.map((row) => (
                  <div key={`${section.id}-${row.label}`} className="min-w-0">
                    <dt className="text-xs text-ink/45">{row.label}</dt>
                    <dd className="mt-1 break-words font-sans font-semibold text-ink">
                      <FactValue row={row} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
          {highlights.map((row) => (
            <div key={`${row.sectionId}-${row.label}`} className="min-w-0">
              <dt className="text-xs text-ink/45">{row.label}</dt>
              <dd className="mt-1 break-words font-sans text-sm font-semibold text-ink">
                <FactValue row={row} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {showToggle ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 font-sans text-sm font-semibold text-canopy"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Show fewer details" : "View all property details"}
            <span aria-hidden>{expanded ? "↑" : "↓"}</span>
          </button>
        </div>
      ) : null}
    </ListingSection>
  );
}
