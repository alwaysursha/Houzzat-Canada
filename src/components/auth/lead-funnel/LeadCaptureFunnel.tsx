"use client";

import { useEffect, useState } from "react";
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
import { describeObservedBudget } from "@/lib/auth/buyer-confirmed-preference";
import { CONSUMER_BUYING_TIMEFRAMES, purchaseTimeframeLabel } from "@/lib/agent/timeframe";
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
  | "editPrice";

const STEP_PROGRESS: Record<FunnelStep, number> = {
  otp: 0.12,
  ownership: 0.28,
  claimAddress: 0.4,
  timeframe: 0.55,
  financing: 0.7,
  preference: 0.88,
  editPrice: 0.88,
};

type ObservedPreference = {
  cities: string[];
  maxPrice: number | null;
  minPrice: number | null;
  propertyTypes: string[];
  minBeds: number | null;
  summary: string | null;
};

export function LeadCaptureFunnel({
  onComplete,
}: {
  onComplete: (result: { showTour: boolean; mlsNumber: string | null }) => void;
}) {
  const [step, setStep] = useState<FunnelStep>("otp");
  const [history, setHistory] = useState<FunnelStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [observed, setObserved] = useState<ObservedPreference | null>(null);
  const [listingMls, setListingMls] = useState<string | null>(null);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
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
    setStep(next);
    setError(null);
  }

  function back() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setStep(prev);
    setError(null);
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
          if (data.observedPreference?.minPrice != null) {
            setMinPrice(String(data.observedPreference.minPrice));
          }
          if (data.observedPreference?.maxPrice != null) {
            setMaxPrice(String(data.observedPreference.maxPrice));
          }
          if (data.phoneOtpVerifiedAt) {
            setStep("ownership");
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

  async function verifyOtp() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Incorrect code.");
        setPending(false);
        return;
      }
      reportPhoneVerified();
      setPending(false);
      go("ownership");
    } catch {
      setPending(false);
      setError("Could not verify code.");
    }
  }

  async function skipOtp() {
    setPending(true);
    try {
      await fetch("/api/auth/phone-otp/skip", { method: "POST" });
      reportPhoneVerificationSkipped();
    } catch {
      /* continue anyway — Lead already captured */
    }
    setPending(false);
    go("ownership");
  }

  async function savePhoneEdit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone-otp/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDraft }),
      });
      const data = (await res.json()) as {
        error?: string;
        maskedPhone?: string;
        otpError?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not update number.");
        setPending(false);
        return;
      }
      if (data.maskedPhone) {
        setMaskedPhone(data.maskedPhone);
        reportPhoneVerificationSent();
      }
      if (data.otpError) setError(data.otpError);
      setEditingPhone(false);
      setOtpCode("");
    } catch {
      setError("Could not update number.");
    }
    setPending(false);
  }

  async function postStep(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/qualification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        setPending(false);
        return false;
      }
      setPending(false);
      return true;
    } catch {
      setError("Could not save.");
      setPending(false);
      return false;
    }
  }

  async function finish() {
    await postStep({ step: "complete" });
    reportQualificationCompleted();
    touchIntent();
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

  const budgetLabel =
    observed?.summary ||
    (observed?.maxPrice != null
      ? `We've set your home search to ${describeObservedBudget(observed.maxPrice)}.`
      : null);

  return (
    <div className="relative px-5 pb-5 pt-6">
      <FunnelProgress value={STEP_PROGRESS[step]} />
      {history.length > 0 && step !== "otp" ? (
        <button
          type="button"
          onClick={back}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink/60 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
      ) : null}

      {step === "otp" ? (
        <div className="space-y-3.5">
          <h3 className="font-display text-xl text-ink">Verify Your Mobile</h3>
          {editingPhone ? (
            <>
              <p className="text-sm text-ink/70">Enter your corrected mobile number.</p>
              <Input
                type="tel"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
                placeholder="(647) 555-1234"
              />
              <Button
                type="button"
                className="w-full"
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
              <p className="text-sm text-ink/70">
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
                className="text-center text-lg tracking-[0.3em]"
              />
              <Button
                type="button"
                className="w-full"
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
                    void fetch("/api/auth/phone-otp/send", { method: "POST" }).then(
                      (r) => {
                        if (r.ok) reportPhoneVerificationSent();
                      },
                    );
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
          <h3 className="font-display text-xl text-ink">
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
                "w-full rounded-xl border border-line px-4 py-3.5 text-left text-sm font-semibold text-ink transition hover:border-canopy/40 hover:bg-mist",
              )}
              onClick={() => {
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
          <h3 className="font-display text-xl text-ink">Claim Your Address</h3>
          <p className="text-sm text-ink/70">
            Keep an eye on what&apos;s happening around your property.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="funnel-claim-address">
              Property address
            </label>
            <AddressAutocomplete
              source="google"
              fillOnly
              portalDesktopSuggestions
              minChars={2}
              placeholder="Start typing your address…"
              inputClassName="h-11 text-sm"
              onQueryChange={(query) => {
                setClaimedPlace((prev) => {
                  if (!prev) return null;
                  const q = query.trim().toLowerCase();
                  if (!q) return null;
                  const street = prev.address.split(",")[0]?.trim().toLowerCase();
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
            />
          </div>
          <p className="text-xs leading-relaxed text-ink/50">
            Stay updated on new listings, sold homes and market activity around
            your property.
          </p>
          <Button
            type="button"
            className="w-full"
            disabled={pending || !claimedPlace?.address}
            onClick={() => {
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
          <h3 className="font-display text-xl text-ink">
            When are you planning to buy?
          </h3>
          {CONSUMER_BUYING_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              disabled={pending}
              className="w-full rounded-xl border border-line px-4 py-3.5 text-left text-sm font-semibold text-ink transition hover:border-canopy/40 hover:bg-mist"
              onClick={() => {
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
          <h3 className="font-display text-xl text-ink">
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
              className="w-full rounded-xl border border-line px-4 py-3.5 text-left text-sm font-semibold text-ink transition hover:border-canopy/40 hover:bg-mist"
              onClick={() => {
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
          <h3 className="font-display text-xl text-ink">
            {budgetLabel
              ? `We've set your home search to ${
                  describeObservedBudget(observed?.maxPrice) ?? "your range"
                }.`
              : "Confirm your home search"}
          </h3>
          {observed?.summary ? (
            <p className="text-sm text-ink/70">{observed.summary}</p>
          ) : (
            <p className="text-sm text-ink/70">
              Is this the price range you&apos;re looking for?
            </p>
          )}
          {budgetLabel || observed?.maxPrice != null ? (
            <p className="text-sm font-medium text-ink">
              Is this the price range you&apos;re looking for?
            </p>
          ) : null}
          <button
            type="button"
            disabled={pending}
            className="w-full rounded-xl border border-line px-4 py-3.5 text-left text-sm font-semibold text-ink transition hover:border-canopy/40 hover:bg-mist"
            onClick={() => {
              void postStep({
                step: "preference",
                confirm: true,
                cities: observed?.cities ?? [],
                propertyTypes: observed?.propertyTypes ?? [],
                minPrice: observed?.minPrice ?? null,
                maxPrice: observed?.maxPrice ?? null,
                minBeds: observed?.minBeds ?? null,
              }).then((ok) => {
                if (ok) void finish();
              });
            }}
          >
            Yes, that&apos;s right
          </button>
          <button
            type="button"
            disabled={pending}
            className="w-full rounded-xl border border-line px-4 py-3.5 text-left text-sm font-semibold text-ink transition hover:border-canopy/40 hover:bg-mist"
            onClick={() => go("editPrice")}
          >
            Edit Price Range
          </button>
        </div>
      ) : null}

      {step === "editPrice" ? (
        <div className="space-y-3.5">
          <h3 className="font-display text-xl text-ink">Edit Price Range</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="funnel-min-price">
                Minimum
              </label>
              <Input
                id="funnel-min-price"
                inputMode="numeric"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Any"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="funnel-max-price">
                Maximum
              </label>
              <Input
                id="funnel-max-price"
                inputMode="numeric"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Any"
              />
            </div>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={pending}
            onClick={() => {
              const min = minPrice.trim() ? Number(minPrice) : null;
              const max = maxPrice.trim() ? Number(maxPrice) : null;
              void postStep({
                step: "preference",
                confirm: false,
                cities: observed?.cities ?? [],
                propertyTypes: observed?.propertyTypes ?? [],
                minPrice: Number.isFinite(min as number) ? min : null,
                maxPrice: Number.isFinite(max as number) ? max : null,
                minBeds: observed?.minBeds ?? null,
              }).then((ok) => {
                if (ok) void finish();
              });
            }}
          >
            Update & Continue
          </Button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
