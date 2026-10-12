"use client";

import { useEffect, useState } from "react";
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
  const heading = "Recommended for you";

  return (
    <>
      <section
        aria-label={heading}
        data-homepage-search-source={source.kind}
        className={cn(
          "relative overflow-hidden",
          variant === "signature"
            ? "rounded-2xl bg-gradient-to-br from-canopy/[0.12] via-emerald-50/80 to-teal-50/50 px-4 py-5 sm:px-5 sm:py-6"
            : // Bleed to content-pad edges (no boxed border seams / horizontal overflow).
              "-mx-4 bg-gradient-to-br from-canopy/[0.14] via-[#e8f5ef] to-[#f0faf5] px-4 py-5 sm:-mx-6 sm:px-6 sm:py-6 md:py-7 lg:-mx-10 lg:px-10",
        )}
      >
        <div className="relative">
          <p className="font-display text-xl tracking-tight text-ink sm:text-2xl">
            {heading}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {chipLabels.length > 0 ? (
              <ul
                className="flex min-w-0 flex-1 flex-wrap gap-2"
                aria-label="Search criteria"
              >
                {chipLabels.map((label) => (
                  <li
                    key={label}
                    className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-canopy-deep shadow-[0_1px_0_rgba(20,32,28,0.04)] ring-1 ring-canopy/15"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-canopy px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-canopy-deep sm:ml-auto"
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              Edit homepage search
            </button>
          </div>

          <HomepagePersonalizedListings source={source} />
        </div>
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
