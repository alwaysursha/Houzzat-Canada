"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { FunnelProgress } from "@/components/auth/lead-funnel/FunnelProgress";
import { QUALIFICATION_COMPLETED_EVENT } from "@/components/auth/CustomerWelcomeChatScheduler";
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
import { CONSUMER_BUYING_TIMEFRAMES, purchaseTimeframeLabel } from "@/lib/agent/timeframe";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import {
  clearClaimAddressContext,
  readClaimAddressContext,
} from "@/lib/property-address/claim-context";
import {
  SELLER_TIMEFRAME_OPTIONS,
  type SellerTimeframeChoice,
} from "@/lib/property-address/seller-timeframe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FunnelStep =
  | "otp"
  | "ownership"
  | "claimAddress"
  | "sellingTimeframe"
  | "sellerDone"
  | "timeframe"
  | "financing";

const STEP_PROGRESS: Record<FunnelStep, number> = {
  otp: 0.15,
  ownership: 0.35,
  claimAddress: 0.5,
  sellingTimeframe: 0.75,
  sellerDone: 1,
  timeframe: 0.7,
  financing: 0.9,
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
  const router = useRouter();
  const claimBoot = readClaimAddressContext();
  const [sellerClaimMode] = useState(() => Boolean(claimBoot?.formattedAddress));
  const [returnPath] = useState(() => claimBoot?.propertyPath ?? null);
  const claimAppliedRef = useRef(false);

  const [step, setStep] = useState<FunnelStep>("otp");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const [sellerChoice, setSellerChoice] =
    useState<SellerTimeframeChoice | null>(null);
  const [, startTransition] = useTransition();
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [listingMls, setListingMls] = useState<string | null>(null);
  const [homeAddress, setHomeAddress] = useState(
    () => claimBoot?.formattedAddress ?? "",
  );
  const [homeUnit, setHomeUnit] = useState(() => claimBoot?.unitNumber ?? "");
  const [claimedPlace, setClaimedPlace] = useState<{
    address: string;
    lat?: number;
    lng?: number;
    placeId?: string;
  } | null>(() =>
    claimBoot?.formattedAddress
      ? {
          address: claimBoot.formattedAddress,
          lat: claimBoot.lat ?? undefined,
          lng: claimBoot.lng ?? undefined,
          placeId: claimBoot.placeId ?? undefined,
        }
      : null,
  );

  function touchIntent() {
    touchPendingCaptureIntent(browserCaptureIntentStore(), {
      host: window.location.hostname,
      now: Date.now(),
    });
  }

  function go(next: FunnelStep) {
    touchIntent();
    startTransition(() => {
      setStep(next);
      setError(null);
      setPressed(null);
    });
  }

  async function afterPhoneGate() {
    if (sellerClaimMode) {
      const claimed = await applySellerClaimFromContext();
      if (!claimed) return; // keep claim context; do not advance without association
      go("sellingTimeframe");
      return;
    }
    go("ownership");
  }

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

  async function applySellerClaimFromContext(): Promise<boolean> {
    if (claimAppliedRef.current) return true;
    const claim = readClaimAddressContext();
    if (!claim?.formattedAddress) return true;
    const ok = await postStep({
      step: "claimAddress",
      homeAddress: claim.formattedAddress,
      homeUnit: claim.unitNumber ?? undefined,
      homeLat: claim.lat ?? undefined,
      homeLng: claim.lng ?? undefined,
      placeId: claim.placeId ?? undefined,
      propertyPath: claim.propertyPath,
    });
    // Only mark applied on success — keep session claim context for retry.
    if (ok) claimAppliedRef.current = true;
    return ok;
  }

  useEffect(() => {
    touchIntent();
    void (async () => {
      try {
        const res = await fetch("/api/auth/qualification");
        if (res.ok) {
          const data = (await res.json()) as {
            listingMls?: string | null;
            phone?: string | null;
            phoneOtpVerifiedAt?: string | null;
          };
          setListingMls(data.listingMls ?? null);
          if (data.phoneOtpVerifiedAt) {
            await afterPhoneGate();
            return;
          }
        }
      } catch {
        /* ignore */
      }
      try {
        // Best-effort early claim while OTP sends — retry on phone gate if needed.
        if (sellerClaimMode) {
          await applySellerClaimFromContext();
        }
        const res = await fetch("/api/auth/phone-otp/send", { method: "POST" });
        const data = (await res.json()) as {
          maskedPhone?: string;
          alreadyVerified?: boolean;
          error?: string;
        };
        if (data.alreadyVerified) {
          await afterPhoneGate();
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
    // Seller claim boot + phone gate only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount bootstrap
  }, []);

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
      await afterPhoneGate();
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
      await afterPhoneGate();
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

  async function finishSeller() {
    reportQualificationCompleted();
    await postStep({ step: "complete" });
    clearClaimAddressContext();
    try {
      window.dispatchEvent(new Event(QUALIFICATION_COMPLETED_EVENT));
    } catch {
      /* ignore */
    }
    onComplete({ showTour: false, mlsNumber: null });
    if (returnPath) {
      router.push(returnPath);
      router.refresh();
    }
  }

  async function finish() {
    reportQualificationCompleted();
    await postStep({ step: "complete" });
    try {
      window.dispatchEvent(new Event(QUALIFICATION_COMPLETED_EVENT));
    } catch {
      /* ignore */
    }
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

  return (
    <div className="relative px-5 pb-5 pt-6">
      <FunnelProgress value={STEP_PROGRESS[step]} />

      <div
        key={step}
        className="mt-5 animate-in fade-in duration-200"
      >
        {step === "otp" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              Verify your phone
            </h3>
            <p className="text-sm leading-relaxed text-ink/70">
              {maskedPhone
                ? `We sent a code to ${maskedPhone}.`
                : "Enter the code we sent to your phone."}
            </p>
            {editingPhone ? (
              <div className="space-y-3">
                <Input
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  placeholder="Phone number"
                  className="h-11"
                  inputMode="tel"
                />
                <Button
                  type="button"
                  className="h-11 w-full"
                  disabled={pending}
                  onClick={() => void savePhoneEdit()}
                >
                  Send new code
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-ink/50"
                  disabled={pending}
                  onClick={() => setEditingPhone(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="6-digit code"
                  className="h-11 tracking-widest"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <Button
                  type="button"
                  className="h-11 w-full"
                  disabled={pending || otpCode.trim().length < 4}
                  onClick={() => void verifyOtp()}
                >
                  Verify
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-ink/50 hover:text-ink/70"
                  disabled={pending}
                  onClick={() => {
                    setPhoneDraft("");
                    setEditingPhone(true);
                  }}
                >
                  Edit number
                </button>
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
              <label className="text-sm font-medium" htmlFor="funnel-unit">
                Unit # (if applicable)
              </label>
              <Input
                id="funnel-unit"
                value={homeUnit}
                onChange={(e) => setHomeUnit(e.target.value)}
                className="h-11"
                placeholder="Optional"
              />
            </div>
            <Button
              type="button"
              className="h-11 w-full"
              disabled={pending || !claimedPlace?.address}
              onClick={() => {
                void postStep({
                  step: "claimAddress",
                  homeAddress: claimedPlace?.address,
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
              className="w-full text-sm font-semibold text-ink/55 hover:text-ink/75"
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

        {step === "sellingTimeframe" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              How soon are you looking to sell your property?
            </h3>
            <p className="text-sm leading-relaxed text-ink/70">
              Optional — skip anytime. Eligible local listing activity updates
              follow your notification preferences.
            </p>
            {SELLER_TIMEFRAME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={pending}
                className={cn(
                  answerBtn,
                  sellerChoice === opt.value && answerBtnPressed,
                )}
                onClick={() => setSellerChoice(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            <Button
              type="button"
              className="h-11 w-full"
              disabled={pending || !sellerChoice}
              onClick={() => {
                if (!sellerChoice) return;
                setPressed(sellerChoice);
                const body =
                  sellerChoice === "JUST_EXPLORING"
                    ? { step: "sellingTimeframe" as const, exploring: true }
                    : {
                        step: "sellingTimeframe" as const,
                        purchaseTimeframe: sellerChoice,
                      };
                void postStep(body).then((ok) => {
                  if (ok) go("sellerDone");
                });
              }}
            >
              Continue
            </Button>
            <button
              type="button"
              className="w-full text-sm font-semibold text-ink/55 hover:text-ink/75"
              disabled={pending}
              onClick={() => {
                void postStep({
                  step: "sellingTimeframe",
                  skip: true,
                }).then((ok) => {
                  if (ok) go("sellerDone");
                });
              }}
            >
              Skip for now
            </button>
          </div>
        ) : null}

        {step === "sellerDone" ? (
          <div className="space-y-3.5">
            <h3 className="font-display text-xl leading-snug text-ink">
              You&apos;re all set
            </h3>
            <p className="text-sm leading-relaxed text-ink/70">
              We&apos;ve noted your seller interest for this address. Claiming
              does not verify ownership. Eligible Just Listed, Just Sold (where
              permitted), and weekly area updates follow your notification
              preferences.
            </p>
            <Button
              type="button"
              className="h-11 w-full"
              disabled={pending}
              onClick={() => void finishSeller()}
            >
              Back to property
            </Button>
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
                      if (ok) void finish();
                    },
                  );
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-center text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
