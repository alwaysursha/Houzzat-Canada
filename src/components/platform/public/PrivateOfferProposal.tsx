import Link from "next/link";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { PrivateOfferAcceptForm } from "@/components/platform/public/PrivateOfferAcceptForm";
import { PrivateOfferCheckoutButton } from "@/components/platform/public/PrivateOfferCheckoutButton";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import type {
  PrivateOfferAcceptedPresentation,
  PrivateOfferPresentation,
} from "@/lib/platform/offers/private-offer";
import {
  PRIVATE_OFFER_ACCEPTED_BODY,
  PRIVATE_OFFER_ACCEPTED_NEXT,
  PRIVATE_OFFER_ACCEPTED_TITLE,
  PRIVATE_OFFER_AD_BUDGET_NOTE,
  PRIVATE_OFFER_AD_SPEND_NOTE,
  PRIVATE_OFFER_CHECKOUT_PAID,
  PRIVATE_OFFER_CTA_SUPPORT_LABEL,
  PRIVATE_OFFER_DISCLOSURE,
  PRIVATE_OFFER_EYEBROW,
  PRIVATE_OFFER_HERO_LINE,
  PRIVATE_OFFER_PREPARED_FOR_LABEL,
  PRIVATE_OFFER_PRIVATE_LABEL,
  PRIVATE_OFFER_STANDARD_LABEL,
  PRIVATE_OFFER_UNAVAILABLE_BODY,
  PRIVATE_OFFER_UNAVAILABLE_SUPPORT,
  PRIVATE_OFFER_UNAVAILABLE_TITLE,
} from "@/lib/platform/offers/private-offer-copy";
import { resolveHouzzatProSupportCta } from "@/lib/platform/status";

function formatCad(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function cadenceLabel(cadence: string): string {
  return cadence === "ANNUAL" ? "Annual" : "Monthly";
}

export function PrivateOfferUnavailable() {
  const support = resolveHouzzatProSupportCta();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#07111f] px-4 py-16 text-center">
      <div className="w-full max-w-md">
        <HouzzatProWordmark size="lg" className="text-white" />
        <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight text-white">
          {PRIVATE_OFFER_UNAVAILABLE_TITLE}
        </h1>
        <p className="mt-4 text-base text-slate-300">
          {PRIVATE_OFFER_UNAVAILABLE_BODY}
        </p>
        <p className="mt-3 text-sm text-slate-400">
          {PRIVATE_OFFER_UNAVAILABLE_SUPPORT}
        </p>
        <Link
          href={support.href}
          className="mt-8 inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/40 hover:bg-white/5"
        >
          {PRIVATE_OFFER_CTA_SUPPORT_LABEL}
        </Link>
      </div>
    </div>
  );
}

export function PrivateOfferAccepted({
  presentation,
  rawToken,
}: {
  presentation: PrivateOfferAcceptedPresentation;
  rawToken: string;
}) {
  const support = resolveHouzzatProSupportCta();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#07111f] px-4 py-16 text-center">
      <div className="w-full max-w-lg">
        <HouzzatProWordmark size="lg" className="text-white" />
        <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight text-white">
          {PRIVATE_OFFER_ACCEPTED_TITLE}
        </h1>
        <p className="mt-4 text-base text-slate-300">
          {PRIVATE_OFFER_ACCEPTED_BODY}
        </p>
        <p className="mt-3 text-sm text-slate-400">
          {presentation.paymentComplete
            ? PRIVATE_OFFER_CHECKOUT_PAID
            : PRIVATE_OFFER_ACCEPTED_NEXT}
        </p>
        {presentation.preparedFor.contactName ? (
          <p className="mt-6 text-sm text-slate-500">
            Prepared for {presentation.preparedFor.contactName}
            {presentation.preparedFor.companyName
              ? ` · ${presentation.preparedFor.companyName}`
              : ""}
          </p>
        ) : null}
        {presentation.checkoutEligible && !presentation.paymentComplete ? (
          <PrivateOfferCheckoutButton rawToken={rawToken} />
        ) : null}
        <Link
          href={support.href}
          className="mt-8 inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/40 hover:bg-white/5"
        >
          {PRIVATE_OFFER_CTA_SUPPORT_LABEL}
        </Link>
      </div>
    </div>
  );
}

export function PrivateOfferProposal({
  presentation,
  rawToken,
}: {
  presentation: PrivateOfferPresentation;
  rawToken: string;
}) {
  const expiry = formatDate(presentation.expiresAt);
  const start = formatDate(presentation.proposedStartDate);
  const preparedName = presentation.preparedFor.contactName;
  const preparedCompany = presentation.preparedFor.companyName;

  return (
    <div className="private-offer-page min-h-dvh overflow-x-hidden bg-[#f4f6f5] text-slate-900">
      <div className="relative overflow-hidden bg-[#07111f] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.18),_transparent_45%)]"
        />
        <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <HouzzatProWordmark size="lg" className="text-white" />
          <p className="mt-8 text-[11px] font-semibold tracking-[0.2em] text-emerald-300/90 uppercase">
            {PRIVATE_OFFER_EYEBROW}
          </p>
          <h1 className="mt-3 max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {PRIVATE_OFFER_HERO_LINE}
          </h1>

          {(preparedName || preparedCompany) && (
            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
                {PRIVATE_OFFER_PREPARED_FOR_LABEL}
              </p>
              {preparedName ? (
                <p className="mt-2 text-lg font-semibold text-white">
                  {preparedName}
                </p>
              ) : null}
              {preparedCompany ? (
                <p className="mt-1 text-sm text-slate-300">{preparedCompany}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <main className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <section className="rounded-[1.35rem] border border-slate-200/90 bg-white p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] sm:p-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Offer summary
          </h2>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                Plan
              </dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">
                {presentation.planCode}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                Billing
              </dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">
                {cadenceLabel(presentation.billingCadence)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                Seats
              </dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">
                {presentation.includedSeats} included
                {presentation.additionalSeats > 0
                  ? ` + ${presentation.additionalSeats} additional`
                  : ""}
              </dd>
            </div>
            {presentation.trialDays != null ? (
              <div>
                <dt className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                  Trial
                </dt>
                <dd className="mt-1 text-base font-semibold text-slate-900">
                  {presentation.trialDays} days
                </dd>
              </div>
            ) : null}
            {start ? (
              <div>
                <dt className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                  Proposed start
                </dt>
                <dd className="mt-1 text-base font-semibold text-slate-900">
                  {start}
                </dd>
              </div>
            ) : null}
            {expiry ? (
              <div>
                <dt className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                  Offer valid until
                </dt>
                <dd className="mt-1 text-base font-semibold text-slate-900">
                  {expiry}
                </dd>
              </div>
            ) : null}
          </dl>

          {presentation.showNegotiatedRecurring ? (
            <div className="mt-8 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
                  {PRIVATE_OFFER_STANDARD_LABEL}
                </p>
                <p className="mt-1 text-lg text-slate-500 line-through decoration-slate-400/80">
                  {formatCad(presentation.standardRecurringAmountCents)}
                  <span className="ml-1 text-sm font-normal no-underline">
                    /{presentation.billingCadence === "ANNUAL" ? "year" : "mo"}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-emerald-700 uppercase">
                  {PRIVATE_OFFER_PRIVATE_LABEL}
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {formatCad(presentation.negotiatedRecurringAmountCents)}
                  <span className="ml-1 text-sm font-medium text-slate-500">
                    /{presentation.billingCadence === "ANNUAL" ? "year" : "mo"}
                  </span>
                </p>
              </div>
            </div>
          ) : null}

          {presentation.showNegotiatedSetup ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
                  Standard setup
                </p>
                <p className="mt-1 text-lg text-slate-500 line-through decoration-slate-400/80">
                  {formatCad(presentation.standardSetupFeeCents)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-emerald-700 uppercase">
                  Your setup fee
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {presentation.setupFeeCents === 0
                    ? "Waived"
                    : formatCad(presentation.setupFeeCents)}
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-[1.35rem] border border-slate-200/90 bg-white p-5 sm:p-8">
          <h2 className="font-display text-xl font-semibold tracking-tight text-slate-900">
            Commercial terms
          </h2>

          <div className="mt-6">
            <h3 className="text-[11px] font-semibold tracking-[0.16em] text-emerald-700 uppercase">
              Recurring
            </h3>
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {presentation.recurringLines.map((line) => (
                <li
                  key={`${line.code}-${line.description}-${line.isRecurring}`}
                  className="flex items-start justify-between gap-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-800">
                      {line.description}
                    </p>
                    {line.quantity > 1 ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {line.quantity} × {formatCad(line.amountCents)}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-slate-900">
                    {formatCad(line.lineTotalCents)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
              <p className="text-sm font-semibold text-slate-700">
                Recurring total
              </p>
              <p className="text-lg font-semibold tabular-nums text-slate-900">
                {formatCad(presentation.recurringTotalCents)}
                <span className="ml-1 text-xs font-medium text-slate-500">
                  /{presentation.billingCadence === "ANNUAL" ? "year" : "mo"}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-[11px] font-semibold tracking-[0.16em] text-emerald-700 uppercase">
              One-time
            </h3>
            {presentation.oneTimeLines.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No one-time charges.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                {presentation.oneTimeLines.map((line) => (
                  <li
                    key={`${line.code}-${line.description}-once`}
                    className="flex items-start justify-between gap-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {line.description}
                      </p>
                      {line.adSpendSeparate ? (
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          {PRIVATE_OFFER_AD_SPEND_NOTE}{" "}
                          {PRIVATE_OFFER_AD_BUDGET_NOTE}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-slate-900">
                      {formatCad(line.lineTotalCents)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
              <p className="text-sm font-semibold text-slate-700">
                One-time total
              </p>
              <p className="text-lg font-semibold tabular-nums text-slate-900">
                {formatCad(presentation.oneTimeTotalCents)}
              </p>
            </div>
          </div>

          <p className="mt-6 text-xs text-slate-500">{PRIVATE_OFFER_DISCLOSURE}</p>
          {presentation.hasAdsAddon ? (
            <p className="mt-2 text-xs text-slate-500">
              {PRIVATE_OFFER_AD_SPEND_NOTE} {PRIVATE_OFFER_AD_BUDGET_NOTE} This
              minimum budget is not included in the totals above.
            </p>
          ) : null}
        </section>

        <section className="mt-6 rounded-[1.35rem] border border-slate-200/90 bg-white p-5 sm:p-8">
          <h2 className="font-display text-xl font-semibold tracking-tight text-slate-900">
            Included with {presentation.planCode}
          </h2>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {presentation.planValueLabels.map((label) => (
              <li
                key={label}
                className="flex items-start gap-2.5 text-sm text-slate-700"
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600"
                />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </section>

        <PrivateOfferAcceptForm rawToken={rawToken} />

        <p className="mt-8 text-center text-[11px] tracking-wide text-slate-400">
          {PLATFORM_PRODUCT_NAME} · private commercial proposal
        </p>
      </main>
    </div>
  );
}
