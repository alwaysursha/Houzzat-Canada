"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { SlidersHorizontal } from "lucide-react";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { propertyTypeLabel } from "@/lib/listings/constants";
import {
  formatPersonalizationPriceRange,
  parseHomepagePersonalizationQuery,
  type HomepagePersonalizationQuery,
} from "@/lib/listings/homepage-personalization";
import { cn } from "@/lib/utils";

type ActiveSearch = {
  id: string;
  name: string;
  query: unknown;
};

function propertyTypeChip(query: HomepagePersonalizationQuery) {
  if (!query.propertyTypes?.length) return "All Property Types";
  if (query.propertyTypes.length === 1) {
    return propertyTypeLabel(query.propertyTypes[0] as never);
  }
  return `${query.propertyTypes.length} Property Types`;
}

function cityChip(query: HomepagePersonalizationQuery) {
  const cities =
    query.cities?.length ? query.cities : query.city ? [query.city] : [];
  if (!cities.length) return "Any city";
  if (cities.length === 1) return cities[0]!;
  if (cities.length === 2) return `${cities[0]}, ${cities[1]}`;
  return `${cities.length} cities`;
}

export function PersonalizeHomepageBar({
  cities = [],
}: {
  cities?: string[];
}) {
  const { status, data } = useSession();
  const role = data?.user?.role;
  const [active, setActive] = useState<ActiveSearch | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (status !== "authenticated" || role === "ADMIN" || role === "AGENT") {
      setActive(null);
      return;
    }
    const res = await fetch("/api/saved-searches");
    if (!res.ok) {
      setActive(null);
      return;
    }
    const json = (await res.json()) as {
      items?: Array<{
        id: string;
        name: string;
        query: unknown;
        isHomepageActive?: boolean;
      }>;
    };
    const current =
      json.items?.find((item) => item.isHomepageActive) ?? null;
    setActive(
      current
        ? { id: current.id, name: current.name, query: current.query }
        : null,
    );
  }, [status, role]);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener("houzzat:homepage-personalization-changed", onChange);
    window.addEventListener("houzzat:saved-searches-changed", onChange);
    return () => {
      window.removeEventListener(
        "houzzat:homepage-personalization-changed",
        onChange,
      );
      window.removeEventListener("houzzat:saved-searches-changed", onChange);
    };
  }, [load]);

  if (
    status !== "authenticated" ||
    role === "ADMIN" ||
    role === "AGENT" ||
    !active
  ) {
    return null;
  }

  const query = parseHomepagePersonalizationQuery(active.query);
  const priceLabel =
    formatPersonalizationPriceRange(query) ?? "$0 - $6,000,000";
  const typeLabel = propertyTypeChip(query);
  const cityLabel = cityChip(query);
  const typeActive = Boolean(query.propertyTypes?.length);
  const priceActive = Boolean(query.minPrice || query.maxPrice);
  const cityActive = Boolean(
    query.cities?.length || query.city,
  );

  return (
    <>
      {/* Desktop — Zoocasa-style summary bar */}
      <section
        aria-label="Personalize homepage"
        className="hidden border-y border-canopy/20 bg-canopy/[0.07] md:block"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="text-sm font-semibold text-ink">Personalize homepage</p>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-semibold",
                typeActive
                  ? "border-canopy/45 bg-canopy/10 text-canopy-deep"
                  : "border-line bg-surface text-ink/70",
              )}
            >
              {typeLabel}
            </span>
            <span
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-semibold",
                priceActive
                  ? "border-canopy/45 bg-canopy/10 text-canopy-deep"
                  : "border-line bg-surface text-ink/70",
              )}
            >
              {priceLabel}
            </span>
            <span
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-semibold",
                cityActive
                  ? "border-canopy/45 bg-canopy/10 text-canopy-deep"
                  : "border-line bg-surface text-ink/70",
              )}
            >
              {cityLabel}
            </span>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-md border border-canopy/45 bg-surface px-3 py-1.5 text-xs font-semibold text-canopy transition hover:bg-canopy/5"
            >
              Edit
            </button>
          </div>
        </div>
      </section>

      {/* Mobile — filled CTA with active badge */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="relative flex w-full items-center justify-center gap-2.5 rounded-xl bg-canopy px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-canopy-deep"
        >
          <span className="relative inline-flex">
            <SlidersHorizontal className="size-4" aria-hidden />
            <span
              className="absolute -right-1 -top-1 size-2 rounded-full bg-danger ring-2 ring-canopy"
              aria-hidden
            />
          </span>
          Personalize homepage
        </button>
      </div>

      <PersonalizeHomepageModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cities={cities}
        searchId={active.id}
        initial={{
          name: active.name,
          ...query,
        }}
      />
    </>
  );
}
