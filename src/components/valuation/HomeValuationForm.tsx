"use client";

import type { PropertyType } from "@prisma/client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Home,
  MapPin,
  Newspaper,
} from "lucide-react";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExpertWhatsAppNumber } from "@/components/whatsapp/useExpertWhatsAppNumber";
import { formatPrice, propertyTypeLabel } from "@/lib/listings/constants";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import type { BasementFinish } from "@/lib/market/home-value-estimate";
import { cn } from "@/lib/utils";
import { buildValuationMeetingWhatsAppUrl } from "@/lib/whatsapp";

type Step = "address" | "features" | "contact" | "result";

type EstimateResult = {
  low: number;
  mid: number;
  high: number;
  sampleSize?: number;
  soldCount?: number;
  activeCount?: number;
  method?: string;
  city?: string | null;
  community?: string | null;
  communityAvgSold?: number | null;
  communitySoldCount?: number;
  disclaimer: string;
};

const BENEFITS = [
  {
    icon: BarChart3,
    title: "Personalized value range",
    body: "An estimate shaped by recent sales and active homes near you.",
  },
  {
    icon: Home,
    title: "Recently sold nearby",
    body: "See how similar properties actually traded in your area.",
  },
  {
    icon: Newspaper,
    title: "Market Pulse updates",
    body: "Optional monthly insights on neighbourhood sales and trends.",
  },
] as const;

const BASEMENT_OPTIONS: Array<{ value: BasementFinish; label: string }> = [
  { value: "finished", label: "Finished" },
  { value: "unfinished", label: "Unfinished" },
  { value: "none", label: "No basement" },
  { value: "unknown", label: "Not sure" },
];

const PROPERTY_TYPE_OPTIONS: PropertyType[] = [
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_TOWNHOUSE",
  "CONDO_APT",
  "MULTIPLEX",
];

function nearbySoldHref(opts: {
  lat?: number;
  lng?: number;
  city?: string;
  community?: string | null;
  propertyType?: PropertyType | "";
}): string {
  const params = new URLSearchParams({
    status: "SOLD",
    sort: "newest",
    transactionType: "SALE",
    view: "map",
  });
  if (opts.lat != null && opts.lng != null) {
    params.set("lat", String(opts.lat));
    params.set("lng", String(opts.lng));
  }
  if (opts.city?.trim()) params.set("city", opts.city.trim());
  if (opts.community?.trim()) params.set("community", opts.community.trim());
  if (opts.propertyType) params.set("propertyTypes", opts.propertyType);
  return `/search?${params.toString()}`;
}

function EstimatePreviewWindow({
  result,
  address,
  pending,
  showCommunityAvg,
}: {
  result: EstimateResult | null;
  address: string;
  pending: boolean;
  showCommunityAvg: boolean;
}) {
  const revealed = Boolean(result);

  return (
    <aside
      className={cn(
        "relative flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-line/80 bg-white",
        "shadow-[0_18px_40px_-24px_rgba(20,32,28,0.4)]",
      )}
      aria-live="polite"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(165deg, #e8f2ee 0%, #f7faf8 42%, #ffffff 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute -right-8 top-0 h-40 w-40 rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, rgb(15 107 76 / 0.18), transparent 70%)",
        }}
      />

      <div className="relative px-6 pt-7 sm:px-8">
        <svg
          viewBox="0 0 280 120"
          className="mx-auto h-auto w-full max-w-[16rem] text-ink/25"
          aria-hidden
        >
          <rect
            x="8"
            y="8"
            width="264"
            height="104"
            rx="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            opacity="0.35"
          />
          <path
            d="M40 40h80M40 60h80M40 80h80M70 28v64M100 28v64"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.35"
          />
          <path
            d="M160 40h80M160 60h80M160 80h80M190 28v64M220 28v64"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.28"
          />
          <rect
            x="88"
            y="48"
            width="36"
            height="28"
            rx="3"
            fill="rgb(15 107 76 / 0.12)"
            stroke="#0f6b4c"
            strokeWidth="1.5"
          />
          <path
            d="M96 68v-8l10-7 10 7v8h-6v-5h-8v5z"
            fill="#0f6b4c"
            opacity="0.9"
          />
          <circle cx="230" cy="36" r="10" fill="rgb(31 122 140 / 0.15)" />
          <path
            d="M226 36h8M230 32v8"
            stroke="#1f7a8c"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="relative flex flex-1 flex-col px-6 pb-7 pt-2 sm:px-8">
        <p className="text-center text-sm font-semibold text-ink/70">
          {revealed
            ? "Your property’s estimated value"
            : "Your property’s estimated value will appear here"}
        </p>

        <div
          className={cn(
            "mt-3 text-center transition-all duration-500",
            pending && "animate-pulse",
          )}
        >
          {revealed && result ? (
            <>
              <p className="font-display text-3xl font-semibold tracking-tight text-canopy sm:text-4xl">
                {formatPrice(result.low)} – {formatPrice(result.high)}
              </p>
              <p className="mt-2 text-sm text-ink/55">
                Midpoint{" "}
                <span className="font-semibold text-ink">
                  {formatPrice(result.mid)}
                </span>
              </p>
            </>
          ) : (
            <p className="font-display text-4xl font-semibold tracking-tight text-canopy/45 sm:text-5xl">
              $— – $—
            </p>
          )}
        </div>

        {address.trim() ? (
          <p className="mt-4 line-clamp-2 text-center text-xs text-ink/50">
            {address}
          </p>
        ) : (
          <p className="mt-4 text-center text-xs text-ink/40">
            Enter an address on the left to begin
          </p>
        )}

        <div className="mt-auto border-t border-line/70 pt-5">
          {revealed && result ? (
            <div className="space-y-2 text-center">
              {showCommunityAvg &&
              result.communityAvgSold != null &&
              result.communityAvgSold > 0 ? (
                <p className="text-sm text-ink/70">
                  Average sold in{" "}
                  <span className="font-semibold text-ink">
                    {result.community ?? result.city ?? "your area"}
                  </span>
                  :{" "}
                  <span className="font-semibold text-canopy">
                    {formatPrice(result.communityAvgSold)}
                  </span>
                  {result.communitySoldCount
                    ? ` · ${result.communitySoldCount} sales`
                    : null}
                </p>
              ) : (result.soldCount ?? 0) + (result.activeCount ?? 0) > 0 ? (
                <p className="text-xs text-ink/55">
                  Based on{" "}
                  {(result.soldCount ?? 0) + (result.activeCount ?? 0)} nearby
                  homes in Houzzat inventory
                </p>
              ) : null}
              <a
                href="#how-we-estimate"
                className="text-xs font-semibold text-canopy underline-offset-2 hover:underline"
              >
                How we estimate this value
              </a>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm font-semibold text-ink">
                {pending
                  ? "Pulling neighbourhood sales…"
                  : "Waiting for your address"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink/55">
                Your indicative range updates here as you add home details.
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export function HomeValuationForm() {
  const searchParams = useSearchParams();
  const { digits: whatsappDigits } = useExpertWhatsAppNumber();
  const initialAddress = searchParams.get("address") ?? "";
  const initialCity = searchParams.get("city") ?? "";
  const initialCommunity = searchParams.get("community") ?? "";
  const initialLeadId = searchParams.get("leadId");
  const initialLow = searchParams.get("low");
  const initialHigh = searchParams.get("high");
  const initialLat = searchParams.get("lat");
  const initialLng = searchParams.get("lng");
  const fromHero = searchParams.get("from") === "hero";

  const heroEstimate = useMemo(() => {
    if (!initialLow || !initialHigh) return null;
    const low = Number(initialLow);
    const high = Number(initialHigh);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    return { low, high, mid: Math.round((low + high) / 2) };
  }, [initialLow, initialHigh]);

  const [step, setStep] = useState<Step>(
    heroEstimate && initialAddress ? "features" : "address",
  );
  const [address, setAddress] = useState(initialAddress);
  const [city, setCity] = useState(initialCity);
  const [community, setCommunity] = useState<string | null>(
    initialCommunity || null,
  );
  const [areaCommunity, setAreaCommunity] = useState<string | null>(null);
  const [beds, setBeds] = useState("3");
  const [baths, setBaths] = useState("2");
  const [sqft, setSqft] = useState("");
  const [basement, setBasement] = useState<BasementFinish>("unknown");
  const [propertyType, setPropertyType] = useState<PropertyType | "">(
    "DETACHED",
  );
  const [lat, setLat] = useState<number | undefined>(() => {
    if (!initialLat) return undefined;
    const n = Number(initialLat);
    return Number.isFinite(n) ? n : undefined;
  });
  const [lng, setLng] = useState<number | undefined>(() => {
    if (!initialLng) return undefined;
    const n = Number(initialLng);
    return Number.isFinite(n) ? n : undefined;
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [marketPulseOptIn, setMarketPulseOptIn] = useState(true);
  const [neighbourhoodSalesOptIn, setNeighbourhoodSalesOptIn] = useState(true);
  const [pending, setPending] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(initialLeadId);
  const [accountCreated, setAccountCreated] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(
    heroEstimate
      ? {
          low: heroEstimate.low,
          mid: heroEstimate.mid,
          high: heroEstimate.high,
          disclaimer:
            "Indicative range from Houzzat’s Ontario listing inventory. Not a formal appraisal.",
        }
      : null,
  );
  const estimateRequestId = useRef(0);
  const submitLockRef = useRef(false);

  function onPlace(suggestion: AutocompleteSuggestion) {
    setAddress(
      suggestion.city && suggestion.province
        ? `${suggestion.label}, ${suggestion.city}, ${suggestion.province}`
        : suggestion.label,
    );
    if (suggestion.city) setCity(suggestion.city);
    if (suggestion.community) setCommunity(suggestion.community);
    if (typeof suggestion.lat === "number") setLat(suggestion.lat);
    if (typeof suggestion.lng === "number") setLng(suggestion.lng);
  }

  function featurePayload() {
    const bedsN = beds ? Number(beds) : undefined;
    const bathsN = baths ? Number(baths) : undefined;
    const sqftN = sqft ? Number(sqft) : undefined;
    return {
      beds: bedsN != null && Number.isFinite(bedsN) ? bedsN : undefined,
      baths: bathsN != null && Number.isFinite(bathsN) ? bathsN : undefined,
      sqft:
        sqftN != null && Number.isFinite(sqftN) && sqftN >= 200
          ? sqftN
          : undefined,
      basement: basement === "unknown" ? undefined : basement,
      propertyType: propertyType || undefined,
    };
  }

  async function refreshEstimate(opts?: { silent?: boolean }) {
    if (!address.trim()) return;
    const requestId = ++estimateRequestId.current;
    if (!opts?.silent) setEstimating(true);

    try {
      const res = await fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          city: city.trim() || undefined,
          community: community || undefined,
          lat,
          lng,
          intent: "curious",
          estimateOnly: true,
          ...featurePayload(),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        estimate?: EstimateResult;
      };
      if (requestId !== estimateRequestId.current) return;
      if (res.ok && data.estimate) {
        setResult(data.estimate);
        if (data.estimate.community) setAreaCommunity(data.estimate.community);
        if (data.estimate.city && !city) setCity(data.estimate.city);
      }
    } catch {
      // Keep the last good estimate visible.
    } finally {
      if (requestId === estimateRequestId.current) setEstimating(false);
    }
  }

  useEffect(() => {
    if (step !== "features" || !address.trim()) return;
    const handle = window.setTimeout(() => {
      void refreshEstimate({ silent: true });
    }, 450);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional feature-driven refresh
  }, [beds, baths, sqft, basement, propertyType, step]);

  async function submitAddress(event: React.FormEvent) {
    event.preventDefault();
    if (submitLockRef.current) return;
    if (!address.trim()) {
      setError("Please enter your home address to continue.");
      return;
    }
    submitLockRef.current = true;
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          city: city.trim() || undefined,
          community: community || undefined,
          lat,
          lng,
          intent: fromHero ? "sell" : "curious",
          quick: true,
          ...(result
            ? {
                estimatedLow: result.low,
                estimatedHigh: result.high,
                estimatedMid: result.mid,
              }
            : {}),
          ...featurePayload(),
          ...loadPersistedUtm(),
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        leadId?: string;
        estimate?: EstimateResult;
      };

      if (!res.ok || !data.leadId || !data.estimate) {
        setError(data.error ?? "Could not pull neighbourhood sales. Try again.");
        return;
      }

      setLeadId(data.leadId);
      setResult(data.estimate);
      if (data.estimate.community) setAreaCommunity(data.estimate.community);
      if (data.estimate.city && !city) setCity(data.estimate.city);
      setStep("features");
    } catch {
      setError("Could not pull neighbourhood sales. Try again.");
    } finally {
      submitLockRef.current = false;
      setPending(false);
    }
  }

  async function submitContact(event: React.FormEvent) {
    event.preventDefault();
    if (submitLockRef.current) return;
    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email.");
      return;
    }
    if (!phone.trim()) {
      setError("Please enter a phone number so we can reach you.");
      return;
    }

    submitLockRef.current = true;
    setPending(true);
    setError(null);

    const marketingOptIn = marketPulseOptIn || neighbourhoodSalesOptIn;

    try {
      const res = await fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          city: city.trim() || undefined,
          community: community || undefined,
          lat,
          lng,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          intent: "sell",
          marketingOptIn,
          acceptTerms: true,
          marketPulseOptIn,
          neighbourhoodSalesOptIn,
          ...(result
            ? {
                estimatedLow: result.low,
                estimatedHigh: result.high,
                estimatedMid: result.mid,
              }
            : {}),
          ...featurePayload(),
          ...loadPersistedUtm(),
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        leadId?: string;
        accountCreated?: boolean;
        estimate?: EstimateResult;
      };

      if (!res.ok || !data.leadId || !data.estimate) {
        setError(data.error ?? "Could not save your estimate. Try again.");
        return;
      }

      setLeadId(data.leadId);
      setAccountCreated(Boolean(data.accountCreated));
      setResult(data.estimate);
      if (data.estimate.community) setAreaCommunity(data.estimate.community);
      setStep("result");
    } catch {
      setError("Could not save your estimate. Try again.");
    } finally {
      submitLockRef.current = false;
      setPending(false);
    }
  }

  const meetingHref =
    whatsappDigits && address.trim()
      ? buildValuationMeetingWhatsAppUrl({
          phoneDigits: whatsappDigits,
          address: address.trim(),
          city: city || null,
          estimateLow: result?.low,
          estimateHigh: result?.high,
        })
      : null;

  const soldBrowseHref = nearbySoldHref({
    lat,
    lng,
    city,
    community: community ?? areaCommunity ?? result?.community,
    propertyType,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-8">
      <div className="min-w-0">
        {step === "address" ? (
          <form onSubmit={submitAddress} className="space-y-5">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <MapPin className="size-4 text-canopy" aria-hidden />
                Your home address
              </label>
              <AddressAutocomplete
                onPlaceSelect={onPlace}
                onQueryChange={setAddress}
                initialQuery={address}
                fillOnly
                source="google"
                minChars={2}
                placeholder="Start typing your address…"
                inputClassName="h-12 text-base"
              />
              <p className="text-xs text-ink/50">
                Pick an address from the suggestions when possible so city and
                map location are accurate. Unit numbers are welcome.
              </p>
            </div>

            {error ? (
              <p className="text-sm font-medium text-danger">{error}</p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="h-12 w-full text-base"
              disabled={pending}
            >
              {pending ? "Pulling neighbourhood sales…" : "Get estimate"}
              {!pending ? <ArrowRight className="size-4" aria-hidden /> : null}
            </Button>
          </form>
        ) : null}

        {step === "features" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              setStep("contact");
            }}
            className="space-y-5"
          >
            <div>
              <h2 className="font-display text-xl tracking-tight text-ink sm:text-2xl">
                Tell us about your home
              </h2>
              <p className="mt-1.5 text-sm text-ink/60">
                We’ll refine the range on the right using similar homes in
                Houzzat inventory.
              </p>
              <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-mist px-3 py-1 text-xs font-medium text-ink/70">
                <MapPin className="size-3.5 shrink-0 text-canopy" aria-hidden />
                <span className="truncate">{address}</span>
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink/80">
                Property type
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PROPERTY_TYPE_OPTIONS.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm font-medium transition",
                      propertyType === type
                        ? "border-canopy bg-canopy/10 text-canopy"
                        : "border-line bg-white text-ink/75 hover:border-canopy/40",
                    )}
                    onClick={() => setPropertyType(type)}
                  >
                    {propertyTypeLabel(type)}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink/80">Beds</label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  className="h-11"
                  value={beds}
                  onChange={(e) => setBeds(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink/80">Baths</label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  className="h-11"
                  value={baths}
                  onChange={(e) => setBaths(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-ink/80">
                  Above-grade sqft{" "}
                  <span className="font-normal text-ink/45">(optional)</span>
                </label>
                <Input
                  type="number"
                  min={200}
                  max={20000}
                  step={50}
                  className="h-11"
                  placeholder="e.g. 1800"
                  value={sqft}
                  onChange={(e) => setSqft(e.target.value)}
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink/80">
                Basement
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {BASEMENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm font-medium transition",
                      basement === option.value
                        ? "border-canopy bg-canopy/10 text-canopy"
                        : "border-line bg-white text-ink/75 hover:border-canopy/40",
                    )}
                    onClick={() => setBasement(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {estimating ? (
              <p className="text-xs font-medium text-canopy">
                Updating your range…
              </p>
            ) : null}

            <p className="rounded-xl bg-mist/80 px-4 py-3 text-sm leading-relaxed text-ink/70">
              For a more accurate value,{" "}
              {meetingHref ? (
                <a
                  href={meetingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-canopy underline-offset-2 hover:underline"
                >
                  book a meeting with an agent
                </a>
              ) : (
                <span className="font-semibold text-ink">
                  book a meeting with an agent
                </span>
              )}
              .
            </p>

            {error ? (
              <p className="text-sm font-medium text-danger">{error}</p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                className="h-12 sm:w-auto"
                onClick={() => {
                  setError(null);
                  setStep("address");
                }}
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </Button>
              <Button type="submit" size="lg" className="h-12 flex-1 text-base">
                Continue
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          </form>
        ) : null}

        {step === "contact" ? (
          <form onSubmit={submitContact} className="space-y-5">
            <div>
              <h2 className="font-display text-xl tracking-tight text-ink sm:text-2xl">
                Save your estimate
              </h2>
              <p className="mt-1.5 text-sm text-ink/60">
                About 30 seconds. We’ll lock in your range and optional market
                updates.
              </p>
              <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-mist px-3 py-1 text-xs font-medium text-ink/70">
                <MapPin className="size-3.5 shrink-0 text-canopy" aria-hidden />
                <span className="truncate">{address}</span>
              </p>
            </div>

            <ul className="space-y-2.5">
              {BENEFITS.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-canopy/10 text-canopy">
                    <item.icon className="size-3.5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {item.title}
                    </p>
                    <p className="text-xs text-ink/60 sm:text-sm">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-ink/80">
                  Full name
                </label>
                <Input
                  required
                  autoComplete="name"
                  className="h-11"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink/80">Email</label>
                <Input
                  required
                  type="email"
                  autoComplete="email"
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink/80">Phone</label>
                <Input
                  required
                  type="tel"
                  autoComplete="tel"
                  className="h-11"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl bg-mist/80 p-4">
              <p className="text-sm font-semibold text-ink">Email preferences</p>
              <label className="flex items-start gap-2.5 text-sm text-ink/75">
                <input
                  type="checkbox"
                  className="mt-1 size-4 rounded border-line accent-canopy"
                  checked={marketPulseOptIn}
                  onChange={(e) => setMarketPulseOptIn(e.target.checked)}
                />
                <span>
                  Send me{" "}
                  <strong className="font-semibold text-ink">Market Pulse</strong>{" "}
                  updates for my area.
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-sm text-ink/75">
                <input
                  type="checkbox"
                  className="mt-1 size-4 rounded border-line accent-canopy"
                  checked={neighbourhoodSalesOptIn}
                  onChange={(e) =>
                    setNeighbourhoodSalesOptIn(e.target.checked)
                  }
                />
                <span>
                  Send me{" "}
                  <strong className="font-semibold text-ink">
                    neighbourhood sales
                  </strong>{" "}
                  alerts nearby.
                </span>
              </label>
            </div>

            <p className="text-sm leading-relaxed text-ink/65">
              For a more accurate value,{" "}
              {meetingHref ? (
                <a
                  href={meetingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-canopy underline-offset-2 hover:underline"
                >
                  book a meeting with an agent
                </a>
              ) : (
                <span className="font-semibold text-ink">
                  book a meeting with an agent
                </span>
              )}
              .
            </p>

            {error ? (
              <p className="text-sm font-medium text-danger">{error}</p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                className="h-12 sm:w-auto"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setStep("features");
                }}
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </Button>
              <Button
                type="submit"
                size="lg"
                className="h-12 flex-1 text-base"
                disabled={pending}
              >
                {pending ? "Saving your estimate…" : "Save my estimate"}
              </Button>
            </div>
          </form>
        ) : null}

        {step === "result" && result ? (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-canopy">
                Estimate ready
              </p>
              <h2 className="mt-1 font-display text-2xl tracking-tight text-ink">
                Your range is on the right
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/65">
                {result.disclaimer}
              </p>
            </div>

            {result.communityAvgSold != null && result.communityAvgSold > 0 ? (
              <div className="rounded-xl border border-line bg-mist/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                  Area sales context
                </p>
                <p className="mt-1 text-sm text-ink/80">
                  Average sold in{" "}
                  <span className="font-semibold text-ink">
                    {result.community ??
                      areaCommunity ??
                      result.city ??
                      (city || "your area")}
                  </span>
                  :{" "}
                  <span className="font-semibold text-canopy">
                    {formatPrice(result.communityAvgSold)}
                  </span>
                </p>
              </div>
            ) : null}

            <div className="space-y-2 rounded-xl border border-line bg-mist/50 p-4 text-sm text-ink/75">
              <p className="flex items-start gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-canopy"
                  aria-hidden
                />
                Estimate saved
                {leadId ? ` (ref ${leadId.slice(0, 8)})` : ""}.
              </p>
              {accountCreated ? (
                <p className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-canopy"
                    aria-hidden
                  />
                  Your Houzzat account is ready — sign in to manage updates.
                </p>
              ) : null}
              {(marketPulseOptIn || neighbourhoodSalesOptIn) && (
                <p className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-canopy"
                    aria-hidden
                  />
                  We’ll send the updates you opted into.
                </p>
              )}
            </div>

            <p className="text-sm leading-relaxed text-ink/65">
              For a more accurate value,{" "}
              {meetingHref ? (
                <a
                  href={meetingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-canopy underline-offset-2 hover:underline"
                >
                  book a meeting with an agent
                </a>
              ) : (
                <span className="font-semibold text-ink">
                  book a meeting with an agent
                </span>
              )}
              .
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              {meetingHref ? (
                <a
                  href={meetingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
                >
                  Book a meeting
                </a>
              ) : (
                <Link
                  href="/auth/sign-in"
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
                >
                  Sign in
                </Link>
              )}
              <Link
                href={soldBrowseHref}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-ink transition hover:border-canopy/40"
              >
                Browse recent sold
              </Link>
            </div>

            <button
              type="button"
              className="w-full text-center text-sm font-medium text-canopy hover:underline"
              onClick={() => {
                setResult(null);
                setStep("address");
                setError(null);
              }}
            >
              Estimate another address
            </button>
          </div>
        ) : null}
      </div>

      <EstimatePreviewWindow
        result={result}
        address={address}
        pending={pending || estimating}
        showCommunityAvg={step === "result" || step === "features"}
      />
    </div>
  );
}
