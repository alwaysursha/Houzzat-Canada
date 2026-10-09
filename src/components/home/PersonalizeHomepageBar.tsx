"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { HomepagePersonalizedListings } from "@/components/home/HomepagePersonalizedListings";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { useHomepageSearchSource } from "@/components/home/use-homepage-search-source";
import { retainSaveSearchIntentHandler } from "@/lib/auth/save-search-intent";
import { buildHomepageCriteriaChipLabels } from "@/lib/listings/homepage-search-source";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

export function PersonalizeHomepageBar({
  cities = [],
  /** Tighter chrome for Agent / Team Signature templates. */
  variant = "default",
}: {
  cities?: string[];
  variant?: "default" | "signature";
}) {
  const { source, ready, reload } = useHomepageSearchSource();
  const { toast } = useSiteAlert();
  const [modalOpen, setModalOpen] = useState(false);

  // Resume guest homepage Save & Apply after auth (existing SAVE_SEARCH CaptureIntent).
  useEffect(() => {
    return retainSaveSearchIntentHandler({
      onSaved: () => {
        toast({
          message: "Homepage search saved.",
          tone: "success",
        });
        window.dispatchEvent(
          new Event("houzzat:homepage-personalization-changed"),
        );
        window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
        reload();
      },
      onFailed: () => {
        toast({
          message: SITE_MESSAGES.genericErrorToast,
          tone: "error",
        });
      },
    });
  }, [toast, reload]);

  if (!ready || !source) return null;

  const chipLabels = buildHomepageCriteriaChipLabels(source.committed);
  const heading =
    source.kind === "primary" ? "Your home search" : "Your recent search";

  return (
    <>
      <section
        aria-label={heading}
        data-homepage-search-source={source.kind}
        className={cn(
          variant === "signature"
            ? "rounded-2xl border border-ink/10 bg-surface/90 px-4 py-4 sm:px-5"
            : "border-y border-canopy/20 bg-canopy/[0.07] px-0 py-3 md:py-3",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm font-semibold",
                variant === "signature" ? "text-ink" : "text-ink",
              )}
            >
              {heading}
            </p>
            {chipLabels.length > 0 ? (
              <ul
                className="mt-2 flex flex-wrap gap-1.5"
                aria-label="Search criteria"
              >
                {chipLabels.map((label) => (
                  <li
                    key={label}
                    className="rounded-md border border-canopy/35 bg-surface px-2.5 py-1 text-xs font-semibold text-canopy-deep"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={source.href}
              className="rounded-md border border-canopy/45 bg-surface px-3 py-1.5 text-xs font-semibold text-canopy transition hover:bg-canopy/5"
            >
              View results
            </Link>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-canopy/45 bg-canopy px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-canopy-deep"
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              Edit
            </button>
          </div>
        </div>

        {/* Mobile filled CTA duplicate for default template rhythm */}
        {variant === "default" ? (
          <div className="mt-3 md:hidden">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="relative flex w-full items-center justify-center gap-2.5 rounded-xl bg-canopy px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-canopy-deep"
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              Edit homepage search
            </button>
          </div>
        ) : null}

        <HomepagePersonalizedListings source={source} />
      </section>

      <PersonalizeHomepageModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cities={cities}
        searchId={source.searchId}
        sourceKind={source.kind}
        initial={{
          name: source.name,
          minPrice: source.query.minPrice,
          maxPrice: source.query.maxPrice,
          minBeds: source.query.minBeds,
          minBaths: source.query.minBaths,
          propertyTypes: source.query.propertyTypes,
          city: source.query.city,
          cities: source.query.cities,
          communities: source.query.communities,
          transactionType: source.query.transactionType,
        }}
      />
    </>
  );
}
