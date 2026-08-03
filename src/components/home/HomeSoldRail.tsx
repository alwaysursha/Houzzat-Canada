"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Lock, X } from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";
import { ListingCard } from "@/components/listings/ListingCard";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { VOW_PUBLIC_NOTE } from "@/lib/vow";

function WhyHiddenPopup({
  open,
  onClose,
  needsEmailVerification,
}: {
  open: boolean;
  onClose: () => void;
  needsEmailVerification: boolean;
}) {
  const titleId = useId();

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/45"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 id={titleId} className="font-display text-2xl text-ink">
            Why is it hidden?
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink/70 transition hover:bg-mist"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink/75">
          {VOW_PUBLIC_NOTE}
        </p>
        {needsEmailVerification ? (
          <p className="mt-3 text-sm leading-relaxed text-ink/75">
            You&apos;re signed in — verify your email to unlock sold and leased
            details.
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-ink/75">
            By registering, you become a Houzzat client and agree to VOW display
            terms.{" "}
            <AuthOpenButton
              mode="sign-up"
              callbackUrl="/#recently-sold"
              className="font-semibold text-canopy hover:underline"
              onClick={onClose}
            >
              Create a free account
            </AuthOpenButton>
            .
          </p>
        )}
      </div>
    </div>
  );
}

function LockedSoldCard({
  listing,
  needsEmailVerification,
}: {
  listing: ListingCardData;
  needsEmailVerification: boolean;
}) {
  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <ListingCard listing={listing} lockedPreview />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <div className="flex w-full max-w-[17rem] flex-col items-center gap-3 rounded-3xl border border-white/50 bg-white/90 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md">
          {needsEmailVerification ? (
            <EmailVerificationRequired
              variant="featured"
              compact
              icon="lock"
              eyebrow="Sold prices"
              callbackUrl="/#recently-sold"
              title="Verify email"
              body="Confirm your email to view sold prices."
            />
          ) : (
            <>
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-canopy text-white shadow-sm">
                <Lock className="size-5" strokeWidth={2.5} aria-hidden />
              </span>
              <AuthOpenButton
                mode="sign-in"
                callbackUrl="/#recently-sold"
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-canopy px-4 text-sm font-semibold text-white transition hover:bg-canopy-deep"
              >
                Login Required
              </AuthOpenButton>
            </>
          )}
          <button
            type="button"
            onClick={() => setWhyOpen(true)}
            className="text-sm font-bold text-canopy-deep underline underline-offset-2 hover:text-canopy"
          >
            Why is it hidden?
          </button>
        </div>
      </div>
      <WhyHiddenPopup
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
        needsEmailVerification={needsEmailVerification}
      />
    </div>
  );
}

export function HomeSoldRail({
  items,
  isClient,
  needsEmailVerification = false,
  emptyLabel,
  regionLabel,
  seeAllHref = "/search?status=SOLD",
}: {
  items: ListingCardData[];
  isClient: boolean;
  needsEmailVerification?: boolean;
  emptyLabel?: string;
  regionLabel?: string;
  seeAllHref?: string;
}) {
  if (items.length === 0 && !emptyLabel) return null;

  return (
    <section
      id="recently-sold"
      className="scroll-mt-[calc(var(--site-header-stack)+0.75rem)] space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Recently sold</h2>
          {regionLabel ? (
            <p className="mt-1 text-sm text-ink/60">{regionLabel}</p>
          ) : null}
        </div>
        {isClient ? (
          <Link
            href={seeAllHref}
            className="text-sm font-semibold text-canopy"
          >
            See sold search →
          </Link>
        ) : needsEmailVerification ? (
          <span className="text-sm font-semibold text-ink/55">
            Verify email to unlock sold
          </span>
        ) : (
          <AuthOpenButton
            mode="sign-up"
            callbackUrl="/#recently-sold"
            className="text-sm font-semibold text-canopy"
          >
            Become a client →
          </AuthOpenButton>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink/50">{emptyLabel}</p>
      ) : (
        <FreeSwipeRail label="Recently sold">
          {items.map((listing) =>
            isClient ? (
              <ListingCard key={listing.mlsNumber} listing={listing} />
            ) : (
              <LockedSoldCard
                key={listing.mlsNumber}
                listing={listing}
                needsEmailVerification={needsEmailVerification}
              />
            ),
          )}
        </FreeSwipeRail>
      )}
    </section>
  );
}
