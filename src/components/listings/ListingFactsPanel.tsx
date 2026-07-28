import Link from "next/link";
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
    <section className="space-y-6" aria-label="Listing details">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Listing details</h2>
        {virtualTour ? (
          <Link
            href={virtualTour}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-canopy hover:underline"
          >
            Virtual tour
          </Link>
        ) : null}
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
          <div key={section.id} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/45">
              {section.title}
            </h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface p-5 text-sm sm:grid-cols-2">
              {section.rows.map((row) => (
                <div key={`${section.id}-${row.label}`} className="min-w-0">
                  <dt className="text-ink/45">{row.label}</dt>
                  <dd className="break-words font-medium text-ink">
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
    </section>
  );
}
