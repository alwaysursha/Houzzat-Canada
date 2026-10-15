"use client";

import type { PropertyType } from "@prisma/client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExpertWhatsAppNumber } from "@/components/whatsapp/useExpertWhatsAppNumber";
import { useClientAccess } from "@/hooks/use-client-access";
import { formatPrice, propertyTypeLabel } from "@/lib/listings/constants";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import type {
  BasementFinish,
  ValuationConfidence,
} from "@/lib/market/home-value-estimate";
import {
  VALUATION_ADDRESS_RESELECT_MESSAGE,
  VALUATION_ADDRESS_UNVERIFIED_MESSAGE,
  addressQueryMatchesVerified,
  isVerifiedValuationLocation,
  verifiedLocationFromResolve,
  verifiedLocationFromSuggestion,
  type VerifiedValuationLocation,
} from "@/lib/market/home-value-address";
import {
  HOME_VALUE_DRAFT_STORAGE_KEY,
  parseHomeValueDraft,
  serializeHomeValueDraft,
} from "@/lib/market/home-value-access";
import {
  HOME_VALUE_CONFIDENCE_EVIDENCE_NOTE,
  HOME_VALUE_DISCLAIMER,
  formatValuationConfidence,
  isValuationConfidence,
} from "@/lib/market/home-value-presentation";
import { fetchPropertyAddressResolve } from "@/lib/property-address/search-integration";
import { cn } from "@/lib/utils";
import { buildValuationMeetingWhatsAppUrl } from "@/lib/whatsapp";

type Step = "address" | "features" | "contact" | "result";

type EstimateAccessStatus =
  | "OK"
  | "INSUFFICIENT_DATA"
  | "AUTH_REQUIRED"
  | "EMAIL_VERIFY_REQUIRED"
  | null;

type EstimateResult = {
  low: number;
  mid: number;
  high: number;
  sampleSize?: number;
  soldCount?: number;
  activeCount?: number;
  method?: string;
  confidence?: ValuationConfidence | null;
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
  locationVerified,
  pending,
  showCommunityAvg,
  estimateStatus,
  authMessage,
  callbackPath,
  inPersonHref,
  onAuthIntent,
}: {
  result: EstimateResult | null;
  address: string;
  locationVerified: boolean;
  pending: boolean;
  showCommunityAvg: boolean;
  estimateStatus: EstimateAccessStatus;
  authMessage: string | null;
  callbackPath: string;
  inPersonHref: string | null;
  onAuthIntent?: () => void;
}) {
  const revealed = Boolean(result);
  const insufficient = estimateStatus === "INSUFFICIENT_DATA";
  const authRequired = estimateStatus === "AUTH_REQUIRED";
  const verifyRequired = estimateStatus === "EMAIL_VERIFY_REQUIRED";
  const accessGate = authRequired || verifyRequired;
  const showAddress = locationVerified && Boolean(address.trim());

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
            "linear-gradient(165deg, var(--mist) 0%, var(--surface) 42%, #ffffff 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute -right-8 top-0 h-40 w-40 rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--tenant-primary-rgb) / 0.18), transparent 70%)",
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
            fill="rgb(var(--tenant-primary-rgb) / 0.12)"
            stroke="var(--canopy)"
            strokeWidth="1.5"
          />
          <path
            d="M96 68v-8l10-7 10 7v8h-6v-5h-8v5z"
            fill="var(--canopy)"
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
            : insufficient
              ? "Insufficient Market Data"
              : verifyRequired
                ? "Email verification required"
                : authRequired
                  ? "Sign in to view your estimate"
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
                <span className="font-medium text-ink/80">
                  {formatPrice(result.mid)}
                </span>
              </p>
              {isValuationConfidence(result.confidence) ? (
                <p className="mt-3 text-xs font-medium text-ink/65">
                  {formatValuationConfidence(result.confidence)}
                </p>
              ) : null}
            </>
          ) : insufficient ? (
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-ink/60">
              We don&apos;t have enough reliable comparable property data to
              provide an accurate estimate for this home.
            </p>
          ) : accessGate ? (
            <div className="mx-auto max-w-sm space-y-3">
              <p className="text-sm leading-relaxed text-ink/60">
                {authMessage ??
                  (verifyRequired
                    ? "Verify your email to unlock the sold-based estimate for this home."
                    : "Create a free client account or sign in to unlock the sold-based estimate for this home.")}
              </p>
              <div className="flex flex-col gap-2">
                {verifyRequired ? (
                  <Link
                    href={`/auth/verify-email?callbackUrl=${encodeURIComponent(callbackPath)}`}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-canopy px-4 text-sm font-semibold text-white transition hover:bg-canopy-deep"
                  >
                    Verify email
                  </Link>
                ) : (
                  <>
                    <AuthOpenButton
                      mode="sign-up"
                      callbackUrl={callbackPath}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-canopy px-4 text-sm font-semibold text-white transition hover:bg-canopy-deep"
                      onClick={onAuthIntent}
                    >
                      Create free account
                    </AuthOpenButton>
                    <AuthOpenButton
                      mode="sign-in"
                      callbackUrl={callbackPath}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-mist px-4 text-sm font-semibold text-ink transition hover:border-canopy/40"
                      onClick={onAuthIntent}
                    >
                      Sign in
                    </AuthOpenButton>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="font-display text-4xl font-semibold tracking-tight text-canopy/45 sm:text-5xl">
              $— – $—
            </p>
          )}
        </div>

        {showAddress ? (
          <p className="mt-4 line-clamp-2 text-center text-xs text-ink/50">
            {address}
          </p>
        ) : address.trim() ? (
          <p className="mt-4 text-center text-xs text-ink/45">
            Address entered — select a suggestion or continue so we can verify
            the map location.
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
              <p className="text-[11px] leading-relaxed text-ink/45">
                {result.disclaimer?.trim() || HOME_VALUE_DISCLAIMER}
              </p>
              {isValuationConfidence(result.confidence) ? (
                <p className="text-[11px] leading-relaxed text-ink/40">
                  {HOME_VALUE_CONFIDENCE_EVIDENCE_NOTE}
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
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold text-ink">
                {pending
                  ? "Pulling neighbourhood sales…"
                  : insufficient
                    ? "Insufficient Market Data"
                    : verifyRequired
                      ? "Email verification required"
                      : authRequired
                        ? "Sign in to view your estimate"
                        : showAddress
                          ? "Ready for home details"
                          : "Waiting for a verified address"}
              </p>
              <p className="text-xs leading-relaxed text-ink/55">
                {insufficient
                  ? "Contact a real estate expert for a local review."
                  : verifyRequired
                    ? "Verify your email, then we’ll show your range automatically."
                    : authRequired
                      ? "Your details stay saved — unlock the range after you sign in."
                      : showAddress
                        ? "Your indicative range updates here as you add home details."
                        : "Waiting for a verified address with city and map location."}
              </p>
              {inPersonHref ? (
                <a
                  href={inPersonHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-xs font-semibold text-canopy underline-offset-2 hover:underline"
                >
                  Request an In-Person Valuation
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export type HomeValuationInitialContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  authenticated: boolean;
};

export type HomeValuationVerifiedPrefill = {
  address: string;
  city: string;
  community: string | null;
  lat: number | null;
  lng: number | null;
  unitNumber?: string | null;
};

export function HomeValuationForm({
  initialContact = null,
  verifiedPrefill = null,
}: {
  initialContact?: HomeValuationInitialContact | null;
  /** Server-resolved property address — preferred over raw query params. */
  verifiedPrefill?: HomeValuationVerifiedPrefill | null;
} = {}) {
  const searchParams = useSearchParams();
  const clientAccess = useClientAccess();
  const { digits: whatsappDigits } = useExpertWhatsAppNumber();
  const initialAddress =
    verifiedPrefill?.address ?? searchParams.get("address") ?? "";
  const initialCity = verifiedPrefill?.city ?? searchParams.get("city") ?? "";
  const initialCommunity =
    verifiedPrefill?.community ?? searchParams.get("community") ?? "";
  const initialLeadId = searchParams.get("leadId");
  const initialLat =
    verifiedPrefill?.lat != null
      ? String(verifiedPrefill.lat)
      : searchParams.get("lat");
  const initialLng =
    verifiedPrefill?.lng != null
      ? String(verifiedPrefill.lng)
      : searchParams.get("lng");
  const fromHero = searchParams.get("from") === "hero";
  const fromProperty = Boolean(verifiedPrefill);
  const callbackPath = "/home-valuation";

  // Never treat URL low/high as authoritative — server recomputes after features.
  const [step, setStep] = useState<Step>(
    (fromHero || fromProperty) && initialAddress ? "features" : "address",
  );
  const [address, setAddress] = useState(initialAddress);
  const [city, setCity] = useState(initialCity);
  const [community, setCommunity] = useState<string | null>(
    initialCommunity || null,
  );
  const [areaCommunity, setAreaCommunity] = useState<string | null>(null);
  // No silent DETACHED / 3-bed / 2-bath defaults — user must provide characteristics.
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [sqft, setSqft] = useState("");
  const [basement, setBasement] = useState<BasementFinish>("unknown");
  const [propertyType, setPropertyType] = useState<PropertyType | "">("");
  const [estimateStatus, setEstimateStatus] =
    useState<EstimateAccessStatus>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
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
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(() => {
    const prefillOk = isVerifiedValuationLocation({
      city: initialCity,
      lat: initialLat ? Number(initialLat) : null,
      lng: initialLng ? Number(initialLng) : null,
      label: initialAddress,
    });
    return prefillOk ? initialAddress : null;
  });
  const [firstName, setFirstName] = useState(initialContact?.firstName ?? "");
  const [lastName, setLastName] = useState(initialContact?.lastName ?? "");
  const [email, setEmail] = useState(initialContact?.email ?? "");
  const [phone, setPhone] = useState(initialContact?.phone ?? "");
  const [marketPulseOptIn, setMarketPulseOptIn] = useState(true);
  const [neighbourhoodSalesOptIn, setNeighbourhoodSalesOptIn] = useState(true);
  const [pending, setPending] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(initialLeadId);
  const [accountCreated, setAccountCreated] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const estimateRequestId = useRef(0);
  const submitLockRef = useRef(false);
  const lastAccessRetryKey = useRef<string | null>(null);

  const locationVerified = isVerifiedValuationLocation({
    city,
    lat,
    lng,
    label: verifiedAddress ?? address,
  });

  function applyVerifiedLocation(loc: VerifiedValuationLocation) {
    setAddress(loc.address);
    setVerifiedAddress(loc.address);
    setCity(loc.city);
    setCommunity(loc.community);
    setLat(loc.lat);
    setLng(loc.lng);
    setPlaceId(loc.placeId);
    setError(null);
  }

  function clearVerifiedLocation() {
    setVerifiedAddress(null);
    setCity("");
    setCommunity(null);
    setLat(undefined);
    setLng(undefined);
    setPlaceId(null);
    setResult(null);
    setEstimateStatus(null);
    setAuthMessage(null);
  }

  function persistValuationDraft(nextStep: Step = step) {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        HOME_VALUE_DRAFT_STORAGE_KEY,
        serializeHomeValueDraft({
          address: address.trim(),
          city: city.trim(),
          community,
          lat: lat ?? null,
          lng: lng ?? null,
          placeId,
          verifiedAddress,
          beds,
          baths,
          sqft,
          basement,
          propertyType,
          step: nextStep === "result" ? "features" : nextStep,
        }),
      );
    } catch {
      // sessionStorage may be unavailable
    }
  }

  function clearValuationDraft() {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(HOME_VALUE_DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function applyAccessStatus(
    status: EstimateAccessStatus,
    message?: string | null,
  ) {
    setEstimateStatus(status);
    if (
      status === "AUTH_REQUIRED" ||
      status === "EMAIL_VERIFY_REQUIRED"
    ) {
      setAuthMessage(message ?? null);
      persistValuationDraft(step === "address" ? "features" : step);
      return;
    }
    setAuthMessage(null);
    if (status === "OK") clearValuationDraft();
  }

  function onAddressQueryChange(query: string) {
    setAddress(query);
    if (
      verifiedAddress &&
      !addressQueryMatchesVerified(query, verifiedAddress)
    ) {
      clearVerifiedLocation();
    }
  }

  function onPlace(suggestion: AutocompleteSuggestion) {
    const verified = verifiedLocationFromSuggestion(suggestion);
    if (verified) {
      applyVerifiedLocation(verified);
      return;
    }
    // Incomplete suggestion (e.g. Places details failed) — keep typed label,
    // clear any prior false verification so the panel cannot look "confirmed".
    const label = (suggestion.subtitle ?? suggestion.label).trim();
    if (label) setAddress(label);
    clearVerifiedLocation();
  }

  async function ensureVerifiedLocation(): Promise<VerifiedValuationLocation | null> {
    if (
      locationVerified &&
      lat != null &&
      lng != null &&
      city.trim()
    ) {
      return {
        address: verifiedAddress?.trim() || address.trim(),
        city: city.trim(),
        community,
        province: null,
        lat,
        lng,
        placeId,
        streetNumber: "",
      };
    }

    const query = address.trim();
    if (!query) return null;

    try {
      const resolved = await fetchPropertyAddressResolve({
        query,
        placeId,
      });
      const verified = verifiedLocationFromResolve(resolved);
      if (!verified) return null;
      applyVerifiedLocation(verified);
      return verified;
    } catch {
      return null;
    }
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
    if (!address.trim() || !locationVerified) return;
    const features = featurePayload();
    if (
      !features.propertyType ||
      features.beds == null ||
      lat == null ||
      lng == null ||
      !city.trim()
    ) {
      applyAccessStatus(null);
      setResult(null);
      return;
    }
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
          ...features,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        status?:
          | "OK"
          | "INSUFFICIENT_DATA"
          | "AUTH_REQUIRED"
          | "EMAIL_VERIFY_REQUIRED";
        estimate?: EstimateResult | null;
        message?: string;
      };
      if (requestId !== estimateRequestId.current) return;
      if (!res.ok) return;
      if (data.status === "OK" && data.estimate) {
        applyAccessStatus("OK");
        setResult(data.estimate);
        if (data.estimate.community) setAreaCommunity(data.estimate.community);
        if (data.estimate.city && !city) setCity(data.estimate.city);
        return;
      }
      setResult(null);
      const nextStatus: EstimateAccessStatus =
        data.status === "AUTH_REQUIRED" ||
        data.status === "EMAIL_VERIFY_REQUIRED" ||
        data.status === "INSUFFICIENT_DATA"
          ? data.status
          : "INSUFFICIENT_DATA";
      applyAccessStatus(nextStatus, data.message);
    } catch {
      // Keep prior status.
    } finally {
      if (requestId === estimateRequestId.current) setEstimating(false);
    }
  }

  // Restore verified address + property details after signup/login modal.
  useEffect(() => {
    if (draftRestored || typeof window === "undefined") return;
    setDraftRestored(true);
    try {
      const draft = parseHomeValueDraft(
        window.sessionStorage.getItem(HOME_VALUE_DRAFT_STORAGE_KEY),
      );
      if (!draft?.address.trim()) return;
      setAddress(draft.address);
      setCity(draft.city);
      setCommunity(draft.community);
      setLat(draft.lat ?? undefined);
      setLng(draft.lng ?? undefined);
      setPlaceId(draft.placeId);
      setVerifiedAddress(draft.verifiedAddress);
      setBeds(draft.beds);
      setBaths(draft.baths);
      setSqft(draft.sqft);
      if (
        draft.basement === "finished" ||
        draft.basement === "unfinished" ||
        draft.basement === "none" ||
        draft.basement === "unknown"
      ) {
        setBasement(draft.basement);
      }
      if (draft.propertyType) {
        setPropertyType(draft.propertyType as PropertyType);
      }
      if (draft.step === "features" || draft.step === "contact") {
        setStep(draft.step);
      } else if (
        draft.verifiedAddress &&
        draft.city &&
        draft.lat != null &&
        draft.lng != null
      ) {
        setStep("features");
      }
    } catch {
      // ignore corrupt draft
    }
  }, [draftRestored]);

  // Feature-driven estimate refresh (authorized or gated messaging).
  useEffect(() => {
    if (step !== "features" || !address.trim() || !locationVerified) return;
    const handle = window.setTimeout(() => {
      void refreshEstimate({ silent: true });
    }, 450);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional feature-driven refresh
  }, [beds, baths, sqft, basement, propertyType, step, locationVerified]);

  // After modal auth / email verify, retry once client access unlocks.
  useEffect(() => {
    if (clientAccess.loading) return;
    if (!clientAccess.hasClientAccess) {
      lastAccessRetryKey.current = null;
      return;
    }
    if (!locationVerified || !address.trim()) return;
    const features = featurePayload();
    if (!features.propertyType || features.beds == null) return;
    const retryKey = [
      clientAccess.kind,
      address.trim(),
      city.trim(),
      features.propertyType,
      features.beds,
      features.baths ?? "",
      features.sqft ?? "",
      basement,
    ].join("|");
    if (lastAccessRetryKey.current === retryKey && result) return;
    lastAccessRetryKey.current = retryKey;
    void refreshEstimate({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- access unlock retry
  }, [
    clientAccess.loading,
    clientAccess.hasClientAccess,
    clientAccess.kind,
    locationVerified,
    address,
    city,
    beds,
    baths,
    sqft,
    basement,
    propertyType,
  ]);

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
      const verified = await ensureVerifiedLocation();
      if (!verified) {
        setError(VALUATION_ADDRESS_UNVERIFIED_MESSAGE);
        return;
      }

      const res = await fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: verified.address,
          city: verified.city,
          community: verified.community || undefined,
          lat: verified.lat,
          lng: verified.lng,
          intent: fromHero ? "sell" : "curious",
          quick: true,
          ...featurePayload(),
          ...loadPersistedUtm(),
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        leadId?: string;
        status?:
          | "OK"
          | "INSUFFICIENT_DATA"
          | "AUTH_REQUIRED"
          | "EMAIL_VERIFY_REQUIRED";
        estimate?: EstimateResult | null;
        message?: string;
      };

      // Lead capture can succeed without a dollar estimate (insufficient / auth).
      if (!res.ok || !data.leadId) {
        setError(data.error ?? "Could not start your valuation. Try again.");
        return;
      }

      setLeadId(data.leadId);
      if (data.estimate) {
        setResult(data.estimate);
        applyAccessStatus("OK");
        if (data.estimate.community) setAreaCommunity(data.estimate.community);
        if (data.estimate.city && !city) setCity(data.estimate.city);
      } else {
        setResult(null);
        const nextStatus: EstimateAccessStatus =
          data.status === "AUTH_REQUIRED" ||
          data.status === "EMAIL_VERIFY_REQUIRED" ||
          data.status === "INSUFFICIENT_DATA"
            ? data.status
            : "INSUFFICIENT_DATA";
        applyAccessStatus(nextStatus, data.message);
      }
      setStep("features");
      persistValuationDraft("features");
    } catch {
      setError("Could not start your valuation. Try again.");
    } finally {
      submitLockRef.current = false;
      setPending(false);
    }
  }

  async function submitContact(event: React.FormEvent) {
    event.preventDefault();
    if (submitLockRef.current) return;
    const composedName = `${firstName.trim()} ${lastName.trim()}`.replace(
      /\s+/g,
      " ",
    ).trim();
    if (!composedName || !email.trim()) {
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
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          name: composedName,
          email: email.trim(),
          phone: phone.trim(),
          intent: "sell",
          marketingOptIn,
          acceptTerms: true,
          marketPulseOptIn,
          neighbourhoodSalesOptIn,
          ...featurePayload(),
          ...loadPersistedUtm(),
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        leadId?: string;
        accountCreated?: boolean;
        status?:
          | "OK"
          | "INSUFFICIENT_DATA"
          | "AUTH_REQUIRED"
          | "EMAIL_VERIFY_REQUIRED";
        estimate?: EstimateResult | null;
        message?: string;
      };

      if (!res.ok || !data.leadId) {
        setError(data.error ?? "Could not save your request. Try again.");
        return;
      }

      setLeadId(data.leadId);
      setAccountCreated(Boolean(data.accountCreated));
      if (data.estimate) {
        setResult(data.estimate);
        applyAccessStatus("OK");
        if (data.estimate.community) setAreaCommunity(data.estimate.community);
      } else {
        setResult(null);
        const nextStatus: EstimateAccessStatus =
          data.status === "AUTH_REQUIRED" ||
          data.status === "EMAIL_VERIFY_REQUIRED" ||
          data.status === "INSUFFICIENT_DATA"
            ? data.status
            : "INSUFFICIENT_DATA";
        applyAccessStatus(nextStatus, data.message);
      }
      setStep("result");
    } catch {
      setError("Could not save your request. Try again.");
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
                onPlaceResolved={onPlace}
                onQueryChange={onAddressQueryChange}
                initialQuery={address}
                fillOnly
                source="google"
                minChars={2}
                placeholder="Start typing your address…"
                inputClassName="h-12 text-base"
              />
              <p className="text-xs text-ink/50">
                Select a suggestion so we can verify city and map location.
                Typing alone is OK when we can confirm the exact civic address.
                Unit numbers are welcome.
              </p>
              {locationVerified ? (
                <p className="text-xs font-medium text-canopy">
                  Location verified — ready for your estimate.
                </p>
              ) : address.trim() ? (
                <p className="text-xs text-ink/55">
                  Location not verified yet. Choose a suggestion or continue to
                  let us confirm the address.
                </p>
              ) : null}
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
              if (!propertyType) {
                setError("Select a property type to continue.");
                return;
              }
              if (!beds.trim() || !Number.isFinite(Number(beds))) {
                setError("Enter bedrooms to continue.");
                return;
              }
              if (!locationVerified || lat == null || lng == null || !city.trim()) {
                setError(VALUATION_ADDRESS_RESELECT_MESSAGE);
                setStep("address");
                return;
              }
              setStep("contact");
            }}
            className="space-y-5"
          >
            <div>
              <h2 className="font-display text-xl tracking-tight text-ink sm:text-2xl">
                Tell us about your home
              </h2>
              <p className="mt-1.5 text-sm text-ink/60">
                Estimates use recent sold comparables only. Property type,
                bedrooms, and a verified location are required — we never invent
                missing details.
              </p>
              {locationVerified ? (
                <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-mist px-3 py-1 text-xs font-medium text-ink/70">
                  <MapPin className="size-3.5 shrink-0 text-canopy" aria-hidden />
                  <span className="truncate">{address}</span>
                </p>
              ) : (
                <p className="mt-3 text-xs font-medium text-danger">
                  {VALUATION_ADDRESS_RESELECT_MESSAGE}
                </p>
              )}
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
              {initialContact?.authenticated ? (
                <p className="mt-2 text-xs text-ink/55">
                  Signed in — we filled in the details Houzzat already has. You
                  can correct anything before saving.
                </p>
              ) : null}
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
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink/80">
                  First name
                </label>
                <Input
                  required
                  autoComplete="given-name"
                  className="h-11"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink/80">
                  Last name
                </label>
                <Input
                  autoComplete="family-name"
                  className="h-11"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
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
                <label className="text-sm font-medium text-ink/80">
                  Cellphone
                </label>
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

        {step === "result" ? (
          <div className="space-y-5">
            {result ? (
              <>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-canopy">
                    Estimate ready
                  </p>
                  <h2 className="mt-1 font-display text-2xl tracking-tight text-ink">
                    Your range is on the right
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink/65">
                    {result.disclaimer?.trim() || HOME_VALUE_DISCLAIMER}
                  </p>
                  {isValuationConfidence(result.confidence) ? (
                    <p className="mt-2 text-sm text-ink/60">
                      <span className="font-semibold text-ink">
                        {formatValuationConfidence(result.confidence)}
                      </span>
                      <span className="mt-1 block text-xs text-ink/45">
                        {HOME_VALUE_CONFIDENCE_EVIDENCE_NOTE}
                      </span>
                    </p>
                  ) : null}
                </div>

                {result.communityAvgSold != null &&
                result.communityAvgSold > 0 ? (
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
              </>
            ) : estimateStatus === "EMAIL_VERIFY_REQUIRED" ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-canopy">
                  Almost there
                </p>
                <h2 className="mt-1 font-display text-2xl tracking-tight text-ink">
                  Verify your email
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink/65">
                  {authMessage ??
                    "Verify your email to unlock the sold-based estimate for this home."}
                </p>
                <Link
                  href={`/auth/verify-email?callbackUrl=${encodeURIComponent(callbackPath)}`}
                  className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
                >
                  Verify email
                </Link>
              </div>
            ) : estimateStatus === "AUTH_REQUIRED" ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-canopy">
                  Client access
                </p>
                <h2 className="mt-1 font-display text-2xl tracking-tight text-ink">
                  Sign in to view your estimate
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink/65">
                  {authMessage ??
                    "Create a free client account or sign in to unlock the sold-based estimate for this home."}
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <AuthOpenButton
                    mode="sign-up"
                    callbackUrl={callbackPath}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
                    onClick={() => persistValuationDraft("features")}
                  >
                    Create free account
                  </AuthOpenButton>
                  <AuthOpenButton
                    mode="sign-in"
                    callbackUrl={callbackPath}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-ink transition hover:border-canopy/40"
                    onClick={() => persistValuationDraft("features")}
                  >
                    Sign in
                  </AuthOpenButton>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-canopy">
                  Market check
                </p>
                <h2 className="mt-1 font-display text-2xl tracking-tight text-ink">
                  Insufficient Market Data
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink/65">
                  We don&apos;t have enough reliable comparable property data
                  to provide an accurate estimate for this home.
                </p>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-line bg-mist/50 p-4 text-sm text-ink/75">
              <p className="flex items-start gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-canopy"
                  aria-hidden
                />
                {result ? "Estimate saved" : "Request saved"}
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
              {result
                ? "For a more accurate value, "
                : "A local expert can review your home directly. "}
              {meetingHref ? (
                <a
                  href={meetingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-canopy underline-offset-2 hover:underline"
                >
                  {result
                    ? "book a meeting with an agent"
                    : "Contact a Real Estate Expert"}
                </a>
              ) : (
                <span className="font-semibold text-ink">
                  Contact a Real Estate Expert
                </span>
              )}
              {result ? "." : "."}
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              {meetingHref ? (
                <a
                  href={meetingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
                >
                  {result ? "Book a meeting" : "Contact a Real Estate Expert"}
                </a>
              ) : (
                <Link
                  href="/auth/sign-in"
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
                >
                  Sign in
                </Link>
              )}
              {result ? (
                <Link
                  href={soldBrowseHref}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-ink transition hover:border-canopy/40"
                >
                  Browse recent sold
                </Link>
              ) : null}
            </div>

            <button
              type="button"
              className="w-full text-center text-sm font-medium text-canopy hover:underline"
              onClick={() => {
                setResult(null);
                setEstimateStatus(null);
                clearVerifiedLocation();
                setAddress("");
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
        locationVerified={locationVerified}
        pending={pending || estimating}
        showCommunityAvg={step === "result" || step === "features"}
        estimateStatus={estimateStatus}
        authMessage={authMessage}
        callbackPath={callbackPath}
        inPersonHref={meetingHref}
        onAuthIntent={() =>
          persistValuationDraft(step === "address" ? "features" : step)
        }
      />
    </div>
  );
}
