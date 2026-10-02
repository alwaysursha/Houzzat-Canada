import Link from "next/link";
import { ListingSection } from "@/components/listings/ListingSection";
import {
  buildListingFactSections,
  parseListingFacts,
  type ListingFacts,
} from "@/lib/listings/facts";

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

  const virtualTour = parsed?.virtualTourUrl?.trim() || null;

  return (
    <ListingSection
      id="listing-details"
      eyebrow="Property sheet"
      title="Listing details"
      hint="Key facts from the MLS® sheet for this home."
      action={
        virtualTour ? (
          <Link
            href={virtualTour}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-canopy/10 px-3 py-2 text-xs font-semibold text-canopy transition hover:bg-canopy/15"
          >
            Virtual tour
          </Link>
        ) : null
      }
    >
      <div className="space-y-5">
        {sections.map((section) => (
          <div key={section.id} className="space-y-2.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
              {section.title}
            </h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-line/70 bg-mist/40 p-4 text-sm sm:grid-cols-2">
              {section.rows.map((row) => (
                <div key={`${section.id}-${row.label}`} className="min-w-0">
                  <dt className="text-xs text-ink/45">{row.label}</dt>
                  <dd className="mt-0.5 break-words font-medium text-ink">
                    {row.label === "Virtual tour" ? (
                      <Link
                        href={row.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-canopy hover:underline"
                      >
                        Open tour
                      </Link>
                    ) : (
                      row.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </ListingSection>
  );
}
