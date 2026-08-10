"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { PropertyType } from "@prisma/client";
import { X } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { CityMultiInput } from "@/components/home/CityMultiInput";
import { PriceRangeSlider } from "@/components/home/PriceRangeSlider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { propertyTypeLabel } from "@/lib/listings/constants";
import {
  HOMEPAGE_PRICE_SLIDER_MAX,
  HOMEPAGE_SEARCH_DEFAULT_NAME,
} from "@/lib/listings/homepage-personalization";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

const RESIDENTIAL_TYPES: PropertyType[] = [
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
  "VACANT_LAND",
  "OTHER",
];

function parsePrice(value?: string) {
  if (!value?.trim()) return null;
  const n = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function PersonalizeHomepageModal({
  open,
  onClose,
  cities: _popularCities,
  initial,
  searchId,
}: {
  open: boolean;
  onClose: () => void;
  /** Kept for call-site compatibility; cities are typed manually now. */
  cities?: string[];
  searchId?: string;
  initial?: {
    name?: string;
    minPrice?: string;
    maxPrice?: string;
    propertyTypes?: string[];
    city?: string;
    cities?: string[];
    communities?: string[];
  };
}) {
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const { confirm, toast } = useSiteAlert();
  const [name, setName] = useState(
    initial?.name ?? HOMEPAGE_SEARCH_DEFAULT_NAME,
  );
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(HOMEPAGE_PRICE_SLIDER_MAX);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const initialCities =
      initial?.cities?.length
        ? initial.cities
        : initial?.city
          ? [initial.city]
          : [];
    setName(initial?.name?.trim() || HOMEPAGE_SEARCH_DEFAULT_NAME);
    setMinPrice(parsePrice(initial?.minPrice) ?? 0);
    setMaxPrice(parsePrice(initial?.maxPrice) ?? HOMEPAGE_PRICE_SLIDER_MAX);
    setPropertyTypes(initial?.propertyTypes ?? []);
    setCities(initialCities);
    setError(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  function toggleType(type: PropertyType) {
    setPropertyTypes((current) =>
      current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type],
    );
  }

  async function onSave() {
    setPending(true);
    setError(null);

    const query: Record<string, unknown> = {};
    if (minPrice > 0) query.minPrice = String(minPrice);
    if (maxPrice < HOMEPAGE_PRICE_SLIDER_MAX) {
      query.maxPrice = String(maxPrice);
    }
    if (propertyTypes.length) query.propertyTypes = propertyTypes;
    if (cities.length === 1) query.city = cities[0];
    if (cities.length > 1) query.cities = cities;

    const searchName = name.trim() || HOMEPAGE_SEARCH_DEFAULT_NAME;

    try {
      const res = searchId
        ? await fetch("/api/saved-searches", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: searchId,
              name: searchName,
              query,
              isHomepageActive: true,
            }),
          })
        : await fetch("/api/saved-searches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: searchName,
              query,
              applyToHomepage: true,
            }),
          });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        requiresAuth?: boolean;
        requiresEmailVerification?: boolean;
      };

      if (!res.ok) {
        if (data.requiresAuth) {
          openAuth({ mode: "sign-in", callbackUrl: "/" });
          setError("Sign in to save your homepage search.");
          return;
        }
        if (data.requiresEmailVerification) {
          setError("Verify your email to save and apply a homepage search.");
          return;
        }
        setError(data.error || "Could not save your search. Try again.");
        return;
      }

      window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
      window.dispatchEvent(
        new Event("houzzat:homepage-personalization-changed"),
      );
      onClose();
      router.refresh();
    } catch {
      setError("Could not save your search. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function onReset() {
    if (!searchId) return;
    const ok = await confirm({
      ...SITE_MESSAGES.clearHomepageSearch,
    });
    if (!ok) return;

    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: searchId, isHomepageActive: false }),
      });
      if (!res.ok) {
        toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
        return;
      }
      toast({ message: "Homepage now shows all listings.", tone: "success" });
      window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
      window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
      onClose();
      router.refresh();
    } catch {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
    } finally {
      setResetting(false);
    }
  }

  if (!open) return null;

  const panel = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="personalize-home-title"
      className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/55 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <div>
            <p
              id="personalize-home-title"
              className="font-display text-2xl text-ink"
            >
              {searchId ? "Edit homepage search" : "Create Custom Search"}
            </p>
            <p className="mt-1 text-sm text-ink/55">
              Save a search and apply it to your homepage. You can create more
              later from your account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-ink/50 transition hover:bg-mist hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <label className="block space-y-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Search name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={HOMEPAGE_SEARCH_DEFAULT_NAME}
            />
          </label>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Price
            </p>
            <PriceRangeSlider
              minPrice={minPrice}
              maxPrice={maxPrice}
              onChange={({ minPrice: nextMin, maxPrice: nextMax }) => {
                setMinPrice(nextMin);
                setMaxPrice(nextMax);
              }}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Property type
            </legend>
            <div className="flex flex-wrap gap-2">
              {RESIDENTIAL_TYPES.map((type) => {
                const active = propertyTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleType(type)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                      active
                        ? "bg-ink text-white"
                        : "border border-line bg-mist/60 text-ink/70 hover:border-canopy/40",
                    )}
                  >
                    {propertyTypeLabel(type)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Cities
            </p>
            <CityMultiInput cities={cities} onChange={setCities} />
          </div>

          {error ? (
            <p className="text-sm font-medium text-danger">{error}</p>
          ) : null}
        </div>

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {searchId ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending || resetting}
                onClick={() => void onReset()}
                className="text-danger hover:bg-danger/5 hover:text-danger"
              >
                {resetting ? "Resetting…" : "Reset homepage"}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || resetting}
              onClick={() => void onSave()}
            >
              {pending ? "Saving…" : "Save & Apply"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(panel, document.body);
}
