"use client";

import { useEffect, useState, useTransition } from "react";
import type { PropertyType } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { FunnelProgress } from "@/components/auth/lead-funnel/FunnelProgress";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import {
  peekPendingIntent,
  touchPendingCaptureIntent,
} from "@/lib/auth/capture-intent";
import {
  reportPhoneVerificationSent,
  reportPhoneVerified,
  reportPhoneVerificationSkipped,
  reportQualificationCompleted,
} from "@/lib/auth/funnel-analytics";
import {
  formatConfirmSearchSummary,
  formatCurrencyInputDisplay,
  parseCurrencyInput,
} from "@/lib/auth/buyer-confirmed-preference";
import { CONSUMER_BUYING_TIMEFRAMES, purchaseTimeframeLabel } from "@/lib/agent/timeframe";
import {
  formatPriceCompact,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FunnelStep =
  | "otp"
  | "ownership"
  | "claimAddress"
  | "timeframe"
  | "financing"
  | "preference"
  | "editSearch";

const STEP_PROGRESS: Record<FunnelStep, number> = {
  otp: 0.12,
  ownership: 0.28,
  claimAddress: 0.4,
  timeframe: 0.55,
  financing: 0.7,
  preference: 0.88,
  editSearch: 0.88,
};

type ObservedPreference = {
  cities: string[];
  maxPrice: number | null;
  minPrice: number | null;
  propertyTypes: string[];
  minBeds: number | null;
  minBaths: number | null;
  transactionType: string | null;
  summary: string | null;
};

const answerBtn =
  "w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-left text-sm font-semibold text-ink transition duration-150 hover:border-canopy/40 hover:bg-mist disabled:opacity-60";
const answerBtnPressed =
  "border-canopy/50 bg-canopy/5 ring-1 ring-canopy/25";

export function LeadCaptureFunnel({
  onComplete,
}: {
  onComplete: (result: { showTour: boolean; mlsNumber: string | null }) => void;
}) {
  const [step, setStep] = useState<FunnelStep>("otp");
  const [history, setHistory] = useState<FunnelStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [observed, setObserved] = useState<ObservedPreference | null>(null);
  const [listingMls, setListingMls] = useState<string | null>(null);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [editCity, setEditCity] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [homeUnit, setHomeUnit] = useState("");
  const [claimedPlace, setClaimedPlace] = useState<{
    address: string;
    lat?: number;
    lng?: number;
    placeId?: string;
  } | null>(null);

  function touchIntent() {
    touchPendingCaptureIntent(browserCaptureIntentStore(), {
      host: window.location.hostname,
      now: Date.now(),
    });
  }

  function go(next: FunnelStep) {
    touchIntent();
    setHistory((h) => [...h, step]);
    startTransition(() => {
      setStep(next);
      setError(null);
      setPressed(null);
    });
  }

  function back() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    startTransition(() => {
      setStep(prev);
      setError(null);
      setPressed(null);
    });
  }

  useEffect(() => {
    touchIntent();
    void (async () => {
      try {
        const res = await fetch("/api/auth/qualification");
        if (res.ok) {
          const data = (await res.json()) as {
            observedPreference?: ObservedPreference;
            listingMls?: string | null;
            phone?: string | null;
            phoneOtpVerifiedAt?: string | null;
          };
          setObserved(data.observedPreference ?? null);
          setListingMls(data.listingMls ?? null);
          setMinPrice(data.observedPreference?.minPrice ?? null);
          setMaxPrice(data.observedPreference?.maxPrice ?? null);
          setEditCity(data.observedPreference?.cities?.[0] ?? "");
          if (data.phoneOtpVerifiedAt) {
            setStep("ownership");
            setHistory([]);
            return;
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch("/api/auth/phone-otp/send", { method: "POST" });
        const data = (await res.json()) as {
          maskedPhone?: string;
          alreadyVerified?: boolean;
          error?: string;
        };
        if (data.alreadyVerified) {
          setStep("ownership");
          setHistory([]);
          return;
        }
        if (res.ok && data.maskedPhone) {
          setMaskedPhone(data.maskedPhone);
          reportPhoneVerificationSent();
        } else if (data.error) {
          setError(data.error);
        }
      } catch {
        setError("Could not send verification code.");
      }
    })();
  }, []);

  async function postStep(body: Record<string, unknown>): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/qualification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setPressed(null);
        return false;
      }
      return true;
    } catch {
      setError("Something went wrong.");
      setPressed(null);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function verifyOtp() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Incorrect code.");
        return;
      }
      reportPhoneVerified();
      go("ownership");
    } catch {
      setError("Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function skipOtp() {
    setPending(true);
    try {
      await fetch("/api/auth/phone-otp/skip", { method: "POST" });
      reportPhoneVerificationSkipped();
      go("ownership");
    } finally {
      setPending(false);
    }
  }

  async function savePhoneEdit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone-otp/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDraft.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        maskedPhone?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not update number.");
        return;
      }
      if (data.maskedPhone) setMaskedPhone(data.maskedPhone);
      setEditingPhone(false);
      setOtpCode("");
      reportPhoneVerificationSent();
    } catch {
      setError("Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    reportQualificationCompleted();
    await postStep({ step: "complete" });
    const peeked = peekPendingIntent(browserCaptureIntentStore(), {
      host: window.location.hostname,
      now: Date.now(),
    });
    const fromIntent =
      peeked.ok &&
      peeked.intent.type === "VIEW_LISTING" &&
      "mlsNumber" in peeked.intent
        ? peeked.intent.mlsNumber
        : null;
    const mls = fromIntent ?? listingMls;
    onComplete({
      showTour: Boolean(mls),
      mlsNumber: mls,
    });
  }

  const confirmChips: string[] = [];
  if (observed?.cities?.length) {
    confirmChips.push(observed.cities.filter(Boolean).join(", "));
  }
  if (observed?.propertyTypes?.length === 1) {
    confirmChips.push(
      propertyTypeLabel(observed.propertyTypes[0] as PropertyType),
    );
  } else if (observed?.propertyTypes && observed.propertyTypes.length > 1) {
    confirmChips.push(`${observed.propertyTypes.length} home types`);
  }
  if (observed?.minPrice != null || observed?.maxPrice != null) {
    const min =
      observed.minPrice != null
        ? formatPriceCompact(observed.minPrice)
        : null;
    const max =
      observed.maxPrice != null
        ? formatPriceCompact(observed.maxPrice)
        : null;
    if (min && max) confirmChips.push(`${min}–${max}`);
    else if (max) confirmChips.push(`Under ${max}`);
    else if (min) confirmChips.push(`From ${min}`);
  }
  if (observed?.minBeds != null) {
    confirmChips.push(`${observed.minBeds}+ Beds`);
  }
  if (observed?.minBaths != null) {
    confirmChips.push(`${observed.minBaths}+ Baths`);
  }

  const hideBack = step === "preference" || step === "otp";

  return (
    <div className="relative px-5 pb-5 pt-6">
      <FunnelProgress value={STEP_PROGRESS[step]} />
      {history.length > 0 && !hideBack ? (
        <button
          type="button"
          onClick={back}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink/60 transition hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
      ) : (
        <div className="mb-1 h-0" aria-hidden />
      )}

      <div
        key={step}
        className="motion-safe:animate-[funnelStepIn_200ms_ease-out]"
      >
        {step === "otp" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              Verify Your Mobile
            </h3>
            {editingPhone ? (
              <>
                <p className="text-sm leading-relaxed text-ink/70">
                  Enter your corrected mobile number.
                </p>
                <Input
                  type="tel"
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  placeholder="(647) 555-1234"
                  className="h-11"
                />
                <Button
                  type="button"
                  className="h-11 w-full"
                  disabled={pending}
                  onClick={() => void savePhoneEdit()}
                >
                  Update & Send Code
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-ink/60"
                  onClick={() => setEditingPhone(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-ink/70">
                  We sent a verification code to{" "}
                  <span className="font-medium text-ink">
                    {maskedPhone ?? "your mobile"}
                  </span>
                </p>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="h-11 text-center text-lg tracking-[0.3em]"
                />
                <Button
                  type="button"
                  className="h-11 w-full"
                  disabled={pending || otpCode.trim().length < 4}
                  onClick={() => void verifyOtp()}
                >
                  Verify & Continue
                </Button>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <button
                    type="button"
                    className="font-medium text-canopy hover:underline"
                    onClick={() => {
                      void fetch("/api/auth/phone-otp/send", {
                        method: "POST",
                      }).then((r) => {
                        if (r.ok) reportPhoneVerificationSent();
                      });
                    }}
                  >
                    Resend Code
                  </button>
                  <button
                    type="button"
                    className="font-medium text-ink/60 hover:underline"
                    onClick={() => {
                      setPhoneDraft("");
                      setEditingPhone(true);
                    }}
                  >
                    Edit Number
                  </button>
                </div>
                <button
                  type="button"
                  className="w-full text-sm text-ink/50 hover:text-ink/70"
                  disabled={pending}
                  onClick={() => void skipOtp()}
                >
                  Skip for now
                </button>
              </>
            )}
          </div>
        ) : null}

        {step === "ownership" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              Do you currently own a home?
            </h3>
            {(
              [
                ["Yes", true],
                ["No / Rent", false],
              ] as const
            ).map(([label, ownsHome]) => (
              <button
                key={label}
                type="button"
                disabled={pending}
                className={cn(
                  answerBtn,
                  pressed === label && answerBtnPressed,
                )}
                onClick={() => {
                  setPressed(label);
                  void postStep({ step: "ownership", ownsHome }).then((ok) => {
                    if (!ok) return;
                    if (ownsHome) go("claimAddress");
                    else go("timeframe");
                  });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {step === "claimAddress" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              Claim Your Address
            </h3>
            <p className="text-sm leading-relaxed text-ink/70">
              Keep an eye on what&apos;s happening around your property.
            </p>
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="funnel-claim-address"
              >
                Property address
              </label>
              <AddressAutocomplete
                source="google"
                fillOnly
                fieldMenu
                fieldMenuExpand
                fieldMenuMaxItems={5}
                minChars={2}
                placeholder="Start typing your address…"
                inputClassName="h-11 text-sm"
                initialQuery={homeAddress}
                onQueryChange={(query) => {
                  setHomeAddress(query);
                  setClaimedPlace((prev) => {
                    if (!prev) return null;
                    const q = query.trim().toLowerCase();
                    if (!q) return null;
                    const street = prev.address
                      .split(",")[0]
                      ?.trim()
                      .toLowerCase();
                    if (street && q.includes(street)) return prev;
                    if (q === prev.address.toLowerCase()) return prev;
                    return null;
                  });
                }}
                onPlaceSelect={(place: AutocompleteSuggestion) => {
                  const address = (
                    place.city && place.province
                      ? `${place.label}, ${place.city}, ${place.province}`
                      : (place.subtitle ?? place.label)
                  ).trim();
                  if (!address || place.type === "action") return;
                  setHomeAddress(address);
                  setClaimedPlace({
                    address,
                    lat: place.lat,
                    lng: place.lng,
                    placeId: place.placeId,
                  });
                  if (place.unitNumber?.trim() && !homeUnit.trim()) {
                    setHomeUnit(place.unitNumber.trim());
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="funnel-home-unit">
                Unit # (if applicable)
              </label>
              <Input
                id="funnel-home-unit"
                value={homeUnit}
                onChange={(e) => setHomeUnit(e.target.value)}
                placeholder="Optional"
                autoComplete="address-line2"
                className="h-11"
              />
            </div>
            <p className="text-xs leading-relaxed text-ink/50">
              Stay updated on new listings, sold homes and market activity around
              your property.
            </p>
            <Button
              type="button"
              className="h-11 w-full"
              disabled={pending || !claimedPlace?.address}
              onClick={() => {
                setPressed("claim");
                void postStep({
                  step: "claimAddress",
                  homeAddress: claimedPlace?.address ?? homeAddress.trim(),
                  homeUnit: homeUnit.trim() || undefined,
                  homeLat: claimedPlace?.lat,
                  homeLng: claimedPlace?.lng,
                  placeId: claimedPlace?.placeId,
                }).then((ok) => {
                  if (ok) go("timeframe");
                });
              }}
            >
              Claim My Address
            </Button>
            <button
              type="button"
              className="w-full text-sm font-medium text-ink/60 hover:text-ink"
              disabled={pending}
              onClick={() => {
                void postStep({ step: "claimAddress", maybeLater: true }).then(
                  (ok) => {
                    if (ok) go("timeframe");
                  },
                );
              }}
            >
              Maybe Later
            </button>
          </div>
        ) : null}

        {step === "timeframe" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              When are you planning to buy?
            </h3>
            {CONSUMER_BUYING_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                disabled={pending}
                className={cn(answerBtn, pressed === tf && answerBtnPressed)}
                onClick={() => {
                  setPressed(tf);
                  void postStep({
                    step: "timeframe",
                    purchaseTimeframe: tf,
                  }).then((ok) => {
                    if (ok) go("financing");
                  });
                }}
              >
                {purchaseTimeframeLabel(tf)}
              </button>
            ))}
          </div>
        ) : null}

        {step === "financing" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              Have you been pre-approved for a mortgage?
            </h3>
            {(
              [
                ["Yes", "PRE_APPROVED"],
                ["No", "NOT_PRE_APPROVED"],
                ["Buying with Cash", "CASH"],
              ] as const
            ).map(([label, mortgageFinancing]) => (
              <button
                key={mortgageFinancing}
                type="button"
                disabled={pending}
                className={cn(
                  answerBtn,
                  pressed === mortgageFinancing && answerBtnPressed,
                )}
                onClick={() => {
                  setPressed(mortgageFinancing);
                  void postStep({ step: "financing", mortgageFinancing }).then(
                    (ok) => {
                      if (ok) go("preference");
                    },
                  );
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {step === "preference" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              Is this search correct?
            </h3>
            {confirmChips.length > 0 ? (
              <ul
                className="flex flex-wrap gap-1.5"
                aria-label="Search criteria"
              >
                {confirmChips.map((label) => (
                  <li
                    key={label}
                    className="rounded-md border border-line bg-mist/70 px-2.5 py-1 text-xs font-semibold text-ink"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              disabled={pending}
              className={cn(
                answerBtn,
                pressed === "confirm" && answerBtnPressed,
              )}
              onClick={() => {
                setPressed("confirm");
                void postStep({
                  step: "preference",
                  confirm: true,
                  cities: observed?.cities ?? [],
                  propertyTypes: observed?.propertyTypes ?? [],
                  minPrice: observed?.minPrice ?? null,
                  maxPrice: observed?.maxPrice ?? null,
                  minBeds: observed?.minBeds ?? null,
                  minBaths: observed?.minBaths ?? null,
                  transactionType: observed?.transactionType ?? null,
                }).then((ok) => {
                  if (ok) void finish();
                });
              }}
            >
              Yes, That&apos;s right
            </button>
            <button
              type="button"
              disabled={pending}
              className={cn(answerBtn, pressed === "edit" && answerBtnPressed)}
              onClick={() => {
                setEditCity(observed?.cities?.[0] ?? editCity);
                setMinPrice(observed?.minPrice ?? minPrice);
                setMaxPrice(observed?.maxPrice ?? maxPrice);
                go("editSearch");
              }}
            >
              No, Edit Search
            </button>
          </div>
        ) : null}

        {step === "editSearch" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              Edit Search
            </h3>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="funnel-edit-city">
                Location
              </label>
              <AddressAutocomplete
                source="listings"
                fillOnly
                fieldMenu
                fieldMenuExpand
                fieldMenuMaxItems={5}
                locationScope="cityArea"
                minChars={2}
                placeholder="City / area"
                inputClassName="h-11 text-sm"
                initialQuery={editCity}
                onQueryChange={(q) => setEditCity(q)}
                onPlaceSelect={(place: AutocompleteSuggestion) => {
                  if (
                    place.type !== "city" &&
                    place.group !== "cities" &&
                    place.type !== "community" &&
                    place.group !== "communities" &&
                    place.group !== "popular"
                  ) {
                    return;
                  }
                  const city =
                    place.type === "community" || place.group === "communities"
                      ? place.city || place.label
                      : place.label;
                  if (city?.trim()) setEditCity(city.trim());
                }}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Price range</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    className="text-xs font-medium text-ink/55"
                    htmlFor="funnel-min-price"
                  >
                    Minimum
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">
                      $
                    </span>
                    <Input
                      id="funnel-min-price"
                      inputMode="numeric"
                      value={formatCurrencyInputDisplay(minPrice)}
                      onChange={(e) =>
                        setMinPrice(parseCurrencyInput(e.target.value))
                      }
                      placeholder="Any"
                      className="h-11 pl-7"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label
                    className="text-xs font-medium text-ink/55"
                    htmlFor="funnel-max-price"
                  >
                    Maximum
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">
                      $
                    </span>
                    <Input
                      id="funnel-max-price"
                      inputMode="numeric"
                      value={formatCurrencyInputDisplay(maxPrice)}
                      onChange={(e) =>
                        setMaxPrice(parseCurrencyInput(e.target.value))
                      }
                      placeholder="Any"
                      className="h-11 pl-7"
                    />
                  </div>
                </div>
              </div>
            </div>
            <Button
              type="button"
              className="h-11 w-full"
              disabled={pending}
              onClick={() => {
                if (
                  minPrice != null &&
                  maxPrice != null &&
                  minPrice > maxPrice
                ) {
                  setError("Minimum cannot be higher than maximum.");
                  return;
                }
                const city = editCity.trim();
                const cities = city
                  ? [city]
                  : (observed?.cities ?? []).filter(Boolean);
                setPressed("update");
                void postStep({
                  step: "preference",
                  confirm: false,
                  cities,
                  propertyTypes: observed?.propertyTypes ?? [],
                  minPrice,
                  maxPrice,
                  minBeds: observed?.minBeds ?? null,
                  minBaths: observed?.minBaths ?? null,
                  transactionType: observed?.transactionType ?? null,
                }).then((ok) => {
                  if (!ok) return;
                  setObserved((prev) => ({
                    cities,
                    minPrice,
                    maxPrice,
                    propertyTypes: prev?.propertyTypes ?? [],
                    minBeds: prev?.minBeds ?? null,
                    minBaths: prev?.minBaths ?? null,
                    transactionType: prev?.transactionType ?? null,
                    summary: formatConfirmSearchSummary({
                      cities,
                      minPrice,
                      maxPrice,
                    }),
                  }));
                  void finish();
                });
              }}
            >
              Update & Continue
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
