"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import {
  rememberClaimAddressContext,
  type ClaimAddressContext,
} from "@/lib/property-address/claim-context";
import { cn } from "@/lib/utils";

export function ClaimPropertyAddressButton({
  context,
  className,
}: {
  context: ClaimAddressContext;
  className?: string;
}) {
  const { data: session, status } = useSession();
  const { openAuth } = useAuthModal();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClaim() {
    setPending(true);
    setError(null);
    setMessage(null);
    rememberClaimAddressContext(context);

    try {
      if (status === "unauthenticated" || !session?.user) {
        openAuth({
          mode: "sign-up",
          callbackUrl: context.propertyPath,
        });
        setMessage(
          "Create your free account to continue. Claiming expresses seller interest — it does not verify ownership.",
        );
        return;
      }

      const res = await fetch("/api/auth/qualification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "claimAddress",
          homeAddress: context.formattedAddress,
          homeLat: context.lat ?? undefined,
          homeLng: context.lng ?? undefined,
          homeUnit: context.unitNumber ?? undefined,
          placeId: context.placeId ?? undefined,
          propertyPath: context.propertyPath,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        openAuth({
          mode: "sign-up",
          callbackUrl: context.propertyPath,
        });
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Could not save your address. Try again.");
        return;
      }
      setMessage(
        "Address associated with your account. Optional selling timeframe next — claiming does not verify legal ownership.",
      );
      // Optional selling timeframe via existing qualification funnel (not a new-signup event).
      window.dispatchEvent(new Event("houzzat:lead-captured"));
    } catch {
      setError("Could not save your address. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        disabled={pending || status === "loading"}
        onClick={() => void onClaim()}
        className="inline-flex w-full items-center justify-center rounded-lg bg-canopy px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-canopy/90 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Saving…" : "Claim Your Address"}
      </button>
      <p className="text-xs leading-relaxed text-ink/55">
        For homeowners exploring a sale. Claiming does not verify ownership.
        Eligible local property activity updates follow your notification
        preferences.
      </p>
      {message ? (
        <p className="text-sm text-canopy" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
