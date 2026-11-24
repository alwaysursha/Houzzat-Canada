"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  getPlanDefinition,
  PLAN_DEFINITIONS,
  STANDARD_SETUP_FEE_CENTS,
} from "@/lib/platform/catalog/plans";
import {
  additionalAgentUnitLabel,
  getAdditionalAgentUnitCents,
} from "@/lib/platform/catalog/add-ons";
import { ADS_MINIMUM_MONTHLY_BUDGET_CENTS } from "@/lib/platform/offers/constants";
import {
  CANADIAN_BILLING_REGIONS,
  quoteCommercialTax,
} from "@/lib/platform/billing/canadian-tax";
import { CommercialOfferActionError } from "@/lib/platform/offers/errors";
import { describeManualOfferDiscount } from "@/lib/platform/offers/line-items";

type PlanCode = "SOLO" | "TEAM" | "BROKERAGE";
type BillingCadence = "MONTHLY" | "ANNUAL";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100";
const labelClass = "block text-xs uppercase tracking-wide text-slate-500";

function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsInputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  return Math.round(n * 100);
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function formatCadDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });
}

function formatCadLabel(cents: number, cadence: BillingCadence): string {
  const dollars = (cents / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });
  return cadence === "ANNUAL" ? `${dollars}/year` : `${dollars}/month`;
}

export type PlatformOfferFormInitial = {
  planCode?: PlanCode;
  billingCadence?: BillingCadence;
  negotiatedRecurringAmountCents?: number;
  setupFeeCents?: number;
  additionalSeats?: number;
  trialDays?: number | null;
  proposedStartDate?: string | null;
  expiresAt?: string | null;
  includeCustomApp?: boolean;
  includeGooglePpc?: boolean;
  googlePpcAmountCents?: number | null;
  includeMetaAds?: boolean;
  metaAdsAmountCents?: number | null;
  billingRegion?: string | null;
  billingCountry?: string | null;
  taxExempt?: boolean;
  taxExemptReason?: string | null;
};

export type PlatformOfferWorkspaceOption = {
  id: string;
  name: string;
  slug: string;
};

type PlatformOfferFormProps = {
  mode: "create" | "edit";
  offerId?: string;
  prospectId: string;
  prospectLabel?: string;
  initial?: PlatformOfferFormInitial;
  workspaces?: PlatformOfferWorkspaceOption[];
  linkedWorkspaceId?: string | null;
  lockWorkspace?: boolean;
};

export function PlatformOfferForm({
  mode,
  offerId,
  prospectId,
  prospectLabel,
  initial,
  workspaces = [],
  linkedWorkspaceId = null,
  lockWorkspace = false,
}: PlatformOfferFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const [planCode, setPlanCode] = useState<PlanCode>(
    initial?.planCode ?? "TEAM",
  );
  const [billingCadence, setBillingCadence] = useState<BillingCadence>(
    initial?.billingCadence ?? "ANNUAL",
  );
  const plan = getPlanDefinition(planCode);
  const customAppOneTimeCents = plan.consumerBrandedApp.oneTimeCents;
  const standardRecurring =
    billingCadence === "ANNUAL"
      ? plan.annualPriceCents
      : plan.monthlyPriceCents;

  const [negotiatedRecurring, setNegotiatedRecurring] = useState(
    centsToDollarsInput(
      initial?.negotiatedRecurringAmountCents ?? standardRecurring,
    ),
  );
  const [setupFee, setSetupFee] = useState(
    centsToDollarsInput(initial?.setupFeeCents ?? STANDARD_SETUP_FEE_CENTS),
  );
  const [additionalSeats, setAdditionalSeats] = useState(
    String(initial?.additionalSeats ?? 0),
  );
  const [trialDays, setTrialDays] = useState(
    initial?.trialDays != null ? String(initial.trialDays) : "",
  );
  const [proposedStartDate, setProposedStartDate] = useState(
    initial?.proposedStartDate?.slice(0, 10) ?? "",
  );
  const [expiresAt, setExpiresAt] = useState(() => {
    if (initial?.expiresAt) return initial.expiresAt.slice(0, 10);
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  const [includeCustomApp, setIncludeCustomApp] = useState(
    Boolean(initial?.includeCustomApp),
  );
  const [includeGooglePpc, setIncludeGooglePpc] = useState(
    Boolean(initial?.includeGooglePpc),
  );
  const [googlePpcAmount, setGooglePpcAmount] = useState(
    initial?.googlePpcAmountCents != null
      ? centsToDollarsInput(initial.googlePpcAmountCents)
      : "",
  );
  const [includeMetaAds, setIncludeMetaAds] = useState(
    Boolean(initial?.includeMetaAds),
  );
  const [workspaceId, setWorkspaceId] = useState(linkedWorkspaceId ?? "");
  const [billingRegion, setBillingRegion] = useState(
    initial?.billingCountry && initial.billingCountry !== "CA"
      ? "OUTSIDE"
      : initial?.billingRegion ?? "ON",
  );
  const [taxExempt, setTaxExempt] = useState(Boolean(initial?.taxExempt));
  const [taxExemptReason, setTaxExemptReason] = useState(
    initial?.taxExemptReason ?? "",
  );
  const [metaAdsAmount, setMetaAdsAmount] = useState(
    initial?.metaAdsAmountCents != null
      ? centsToDollarsInput(initial.metaAdsAmountCents)
      : "",
  );

  function onPlanChange(next: PlanCode) {
    setPlanCode(next);
    const def = getPlanDefinition(next);
    const std =
      billingCadence === "ANNUAL"
        ? def.annualPriceCents
        : def.monthlyPriceCents;
    setNegotiatedRecurring(centsToDollarsInput(std));
    if (!def.additionalSeatsAllowed) setAdditionalSeats("0");
    if (!def.consumerBrandedApp.available) setIncludeCustomApp(false);
  }

  function onCadenceChange(next: BillingCadence) {
    setBillingCadence(next);
    const def = getPlanDefinition(planCode);
    const std =
      next === "ANNUAL" ? def.annualPriceCents : def.monthlyPriceCents;
    setNegotiatedRecurring(centsToDollarsInput(std));
  }

  const summary = useMemo(() => {
    const seats = Number(additionalSeats) || 0;
    const nego = dollarsInputToCents(negotiatedRecurring) ?? 0;
    const setup = dollarsInputToCents(setupFee) ?? 0;
    let recurring = Number.isFinite(nego) ? nego : 0;
    let oneTime = Number.isFinite(setup) ? setup : 0;
    if (seats > 0) {
      recurring += seats * getAdditionalAgentUnitCents(billingCadence);
    }
    if (includeCustomApp && customAppOneTimeCents != null) {
      oneTime += customAppOneTimeCents;
    }
    const g = dollarsInputToCents(googlePpcAmount);
    if (includeGooglePpc && g != null && Number.isFinite(g)) oneTime += g;
    const m = dollarsInputToCents(metaAdsAmount);
    if (includeMetaAds && m != null && Number.isFinite(m)) oneTime += m;
    return { recurring, oneTime, seats };
  }, [
    additionalSeats,
    billingCadence,
    googlePpcAmount,
    includeCustomApp,
    includeGooglePpc,
    includeMetaAds,
    metaAdsAmount,
    negotiatedRecurring,
    customAppOneTimeCents,
    setupFee,
  ]);

  const pricingPreview = useMemo(() => {
    const negotiatedRecurringAmountCents = dollarsInputToCents(negotiatedRecurring);
    const setupFeeCents = dollarsInputToCents(setupFee);
    if (
      negotiatedRecurringAmountCents == null ||
      Number.isNaN(negotiatedRecurringAmountCents) ||
      setupFeeCents == null ||
      Number.isNaN(setupFeeCents)
    ) {
      return { ok: false as const, message: "Enter prices in CAD with at most two decimal places." };
    }
    try {
      const quote = describeManualOfferDiscount({
        planCode,
        billingCadence,
        negotiatedRecurringAmountCents,
        setupFeeCents,
      });
      return { ok: true as const, quote };
    } catch (error) {
      return {
        ok: false as const,
        message:
          error instanceof CommercialOfferActionError
            ? error.message
            : "The entered prices are not valid.",
      };
    }
  }, [billingCadence, negotiatedRecurring, planCode, setupFee]);

  const taxQuote = useMemo(() => {
    if (!pricingPreview.ok) return null;
    return quoteCommercialTax({
      country: billingRegion === "OUTSIDE" ? "XX" : "CA",
      region: billingRegion === "OUTSIDE" ? null : billingRegion,
      taxExempt,
      recurringNetCents: summary.recurring,
      oneTimeNetCents: summary.oneTime,
    });
  }, [billingRegion, pricingPreview.ok, summary.oneTime, summary.recurring, taxExempt]);

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId) ?? null;

  async function submit() {
    setSubmitting(true);
    setFeedback(null);
    try {
      if (!pricingPreview.ok) {
        setFeedback({ tone: "error", message: pricingPreview.message });
        return;
      }
      if (taxExempt && !taxExemptReason.trim()) {
        setFeedback({
          tone: "error",
          message: "A tax-exempt offer needs a reason.",
        });
        return;
      }
      const negotiatedRecurringAmountCents =
        pricingPreview.quote.negotiatedRecurringAmountCents;
      const setupFeeCents = pricingPreview.quote.setupFeeCents;

      const addOns: Array<Record<string, unknown>> = [];
      if (includeCustomApp) {
        addOns.push({ code: "CUSTOM_CONSUMER_APP" });
      }
      if (includeGooglePpc) {
        const amountCents = dollarsInputToCents(googlePpcAmount);
        if (amountCents == null || Number.isNaN(amountCents)) {
          setFeedback({
            tone: "error",
            message:
              "Google PPC requires an explicit commercial amount (management fee not decided).",
          });
          return;
        }
        addOns.push({
          code: "GOOGLE_PPC",
          amountCents,
          requiresOperatorTerms: true,
        });
      }
      if (includeMetaAds) {
        const amountCents = dollarsInputToCents(metaAdsAmount);
        if (amountCents == null || Number.isNaN(amountCents)) {
          setFeedback({
            tone: "error",
            message:
              "Meta Ads requires an explicit commercial amount (management fee not decided).",
          });
          return;
        }
        addOns.push({
          code: "META_ADS",
          amountCents,
          requiresOperatorTerms: true,
        });
      }

      const payload = {
        prospectId,
        ...(workspaceId ? { workspaceId } : {}),
        planCode,
        billingCadence,
        negotiatedRecurringAmountCents,
        setupFeeCents,
        additionalSeats: Number(additionalSeats) || 0,
        trialDays: trialDays.trim() ? Number(trialDays) : null,
        proposedStartDate: proposedStartDate
          ? new Date(`${proposedStartDate}T12:00:00.000Z`).toISOString()
          : null,
        expiresAt: expiresAt
          ? new Date(`${expiresAt}T23:59:59.000Z`).toISOString()
          : null,
        addOns,
        billingCountry: billingRegion === "OUTSIDE" ? "XX" : "CA",
        billingRegion: billingRegion === "OUTSIDE" ? null : billingRegion,
        taxExempt,
        taxExemptReason: taxExempt ? taxExemptReason.trim() : null,
      };

      const url =
        mode === "edit" && offerId
          ? `/api/platform/v1/offers/${encodeURIComponent(offerId)}`
          : "/api/platform/v1/offers";
      const response = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as ApiEnvelope<{
        action: { offerId: string };
        offer: { id: string } | null;
      }>;
      if (!response.ok || !body.ok) {
        setFeedback({
          tone: "error",
          message:
            body.ok === false ? body.message : "Unable to save commercial offer.",
        });
        return;
      }
      const id = body.data.offer?.id ?? body.data.action.offerId;
      router.push(`/platform/offers/${encodeURIComponent(id)}`);
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        message: "Network error while saving offer.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        <p
          className={
            feedback.tone === "success"
              ? "rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200"
              : "rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          }
        >
          {feedback.message}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Prospect</h2>
        <p className="mt-2 text-sm text-slate-300">
          {prospectLabel ?? prospectId}
        </p>
        <p className="mt-1 text-xs text-slate-500">{prospectId}</p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Existing workspace</h2>
        {lockWorkspace ? (
          <p className="mt-2 text-sm text-slate-300">
            {selectedWorkspace
              ? `${selectedWorkspace.name} (${selectedWorkspace.slug})`
              : workspaceId}
          </p>
        ) : (
          <label className={`${labelClass} mt-3`}>
            Link a workspace
            <select
              className={inputClass}
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              <option value="">New tenant after payment</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} ({workspace.slug})
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="mt-2 text-xs text-slate-400">
          {workspaceId
            ? "Payment stays on this workspace and does not create a second tenant."
            : "No workspace is linked. Payment will create a new tenant."}
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Plan & billing</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Plan
            <select
              className={inputClass}
              value={planCode}
              onChange={(e) => onPlanChange(e.target.value as PlanCode)}
            >
              {(Object.keys(PLAN_DEFINITIONS) as PlanCode[]).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Billing cadence
            <select
              className={inputClass}
              value={billingCadence}
              onChange={(e) =>
                onCadenceChange(e.target.value as BillingCadence)
              }
            >
              <option value="MONTHLY">MONTHLY</option>
              <option value="ANNUAL">ANNUAL</option>
            </select>
          </label>
          <div>
            <p className={labelClass}>Standard recurring</p>
            <p className="mt-2 text-sm text-slate-300">
              {formatCadLabel(standardRecurring, billingCadence)}
            </p>
          </div>
          <label className={labelClass}>
            Final recurring price (CAD)
            <input
              className={inputClass}
              inputMode="decimal"
              value={negotiatedRecurring}
              onChange={(e) => setNegotiatedRecurring(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Pricing preview
          </h3>
          {pricingPreview.ok ? (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Original recurring</dt>
                <dd className="text-slate-400 line-through">
                  {formatCadLabel(pricingPreview.quote.standardRecurringAmountCents, billingCadence)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Discounted recurring</dt>
                <dd className="font-semibold text-emerald-200">
                  {formatCadLabel(pricingPreview.quote.negotiatedRecurringAmountCents, billingCadence)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Recurring savings</dt>
                <dd className="text-slate-200">
                  {formatCadDollars(pricingPreview.quote.recurringSavingsCents)}{" "}
                  ({formatPercent(pricingPreview.quote.recurringSavingsPercent)})
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Original setup fee</dt>
                <dd className="text-slate-400 line-through">
                  {formatCadDollars(pricingPreview.quote.standardSetupFeeCents)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Discounted setup fee</dt>
                <dd className="font-semibold text-emerald-200">
                  {pricingPreview.quote.setupFeeCents === 0
                    ? "Waived"
                    : formatCadDollars(pricingPreview.quote.setupFeeCents)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Setup fee savings</dt>
                <dd className="text-slate-200">
                  {formatCadDollars(pricingPreview.quote.setupSavingsCents)}{" "}
                  ({formatPercent(pricingPreview.quote.setupSavingsPercent)})
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Checkout recurring</dt>
                <dd className="font-semibold text-slate-100">
                  {formatCadLabel(summary.recurring, billingCadence)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Checkout one-time</dt>
                <dd className="font-semibold text-slate-100">
                  {summary.oneTime === 0 ? "None" : formatCadDollars(summary.oneTime)}
                </dd>
              </div>
              {taxQuote ? (
                <>
                  <div>
                    <dt className="text-slate-500">
                      Estimated {taxQuote.label}
                      {taxQuote.rateBps > 0
                        ? ` ${(taxQuote.rateBps / 100).toFixed(taxQuote.rateBps % 100 === 0 ? 0 : 1)}%`
                        : ""}
                    </dt>
                    <dd className="font-semibold text-slate-100">
                      {formatCadDollars(taxQuote.taxCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">First payment with tax</dt>
                    <dd className="font-semibold text-slate-100">
                      {formatCadDollars(taxQuote.firstGrossCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Future recurring with tax</dt>
                    <dd className="font-semibold text-slate-100">
                      {formatCadLabel(taxQuote.recurringGrossCents, billingCadence)}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="mt-3 text-red-200">{pricingPreview.message}</p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Billing province
              <select
                className={inputClass}
                value={billingRegion}
                onChange={(event) => setBillingRegion(event.target.value)}
              >
                {CANADIAN_BILLING_REGIONS.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.name}
                  </option>
                ))}
                <option value="OUTSIDE">Outside Canada</option>
              </select>
            </label>
            <label className="mt-6 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={taxExempt}
                onChange={(event) => setTaxExempt(event.target.checked)}
              />
              Tax-exempt supply
            </label>
          </div>
          {taxExempt ? (
            <label className={`${labelClass} mt-3`}>
              Exemption reason
              <input
                className={inputClass}
                value={taxExemptReason}
                onChange={(event) => setTaxExemptReason(event.target.value)}
              />
            </label>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            Prices are tax-exclusive. GST/HST is estimated on the discounted
            total for the selected province. Catalog prices stay unchanged, and
            Checkout adds the tax once.
            {taxQuote?.note ? ` ${taxQuote.note}` : ""}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Seats & setup</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className={labelClass}>Included seats</p>
            <p className="mt-2 text-sm text-slate-300">{plan.includedSeats}</p>
          </div>
          <label className={labelClass}>
            Additional seats
            <input
              className={inputClass}
              type="number"
              min={0}
              disabled={!plan.additionalSeatsAllowed}
              value={additionalSeats}
              onChange={(e) => setAdditionalSeats(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {plan.additionalSeatsAllowed
                ? `${additionalAgentUnitLabel(billingCadence)} each · follows offer cadence`
                : "SOLO cannot add seats"}
            </p>
          </label>
          <label className={labelClass}>
            Final setup fee (CAD)
            <input
              className={inputClass}
              inputMode="decimal"
              value={setupFee}
              onChange={(e) => setSetupFee(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Catalog is ${STANDARD_SETUP_FEE_CENTS / 100}. Enter 0 to waive it.
            </p>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-slate-200">
          Trial / start / expiry
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className={labelClass}>
            Trial days
            <input
              className={inputClass}
              type="number"
              min={0}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className={labelClass}>
            Proposed start
            <input
              className={inputClass}
              type="date"
              value={proposedStartDate}
              onChange={(e) => setProposedStartDate(e.target.value)}
            />
            <span className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-500">
              <span>Optional. Leave blank to omit it from the proposal.</span>
              {proposedStartDate ? (
                <button
                  type="button"
                  className="font-semibold text-slate-300 hover:text-white"
                  onClick={() => setProposedStartDate("")}
                >
                  Clear
                </button>
              ) : null}
            </span>
          </label>
          <label className={labelClass}>
            Expiry
            <input
              className={inputClass}
              type="date"
              required
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Add-ons</h2>
        <div className="mt-4 space-y-4">
          <label className="flex items-start gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={includeCustomApp}
              disabled={!plan.consumerBrandedApp.available}
              onChange={(e) => setIncludeCustomApp(e.target.checked)}
            />
            <span>
              Custom Consumer App
              <span className="mt-0.5 block text-xs text-slate-500">
                {plan.consumerBrandedApp.available
                  ? `Planned one-time $${(plan.consumerBrandedApp.oneTimeCents ?? 0) / 100}`
                  : "Unavailable on SOLO"}
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={includeGooglePpc}
                onChange={(e) => setIncludeGooglePpc(e.target.checked)}
              />
              <span>
                Google PPC
                <span className="mt-0.5 block text-xs text-slate-500">
                  Enter HouzzatPRO service/management fee only. Ad spend is
                  separate (client min ${ADS_MINIMUM_MONTHLY_BUDGET_CENTS / 100}
                  /mo) and is never auto-added to totals.
                </span>
              </span>
            </label>
            {includeGooglePpc ? (
              <label className={`${labelClass} pl-7`}>
                Operator commercial amount (CAD)
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={googlePpcAmount}
                  onChange={(e) => setGooglePpcAmount(e.target.value)}
                />
              </label>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={includeMetaAds}
                onChange={(e) => setIncludeMetaAds(e.target.checked)}
              />
              <span>
                Meta Ads
                <span className="mt-0.5 block text-xs text-slate-500">
                  Enter HouzzatPRO service/management fee only. Ad spend is
                  separate (client min ${ADS_MINIMUM_MONTHLY_BUDGET_CENTS / 100}
                  /mo) and is never auto-added to totals.
                </span>
              </span>
            </label>
            {includeMetaAds ? (
              <label className={`${labelClass} pl-7`}>
                Operator commercial amount (CAD)
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={metaAdsAmount}
                  onChange={(e) => setMetaAdsAmount(e.target.value)}
                />
              </label>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5">
        <h2 className="text-sm font-semibold text-emerald-200">Offer summary</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-slate-500">Recurring</dt>
            <dd className="text-slate-100">
              {formatCadLabel(summary.recurring, billingCadence)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">One-time</dt>
            <dd className="text-slate-100">
              {(summary.oneTime / 100).toLocaleString("en-CA", {
                style: "currency",
                currency: "CAD",
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Seats</dt>
            <dd className="text-slate-100">
              {plan.includedSeats} included
              {summary.seats > 0 ? ` + ${summary.seats} additional` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Currency</dt>
            <dd className="text-slate-100">CAD</dd>
          </div>
        </dl>
        <button
          type="button"
          disabled={submitting || !pricingPreview.ok}
          onClick={() => void submit()}
          className="mt-5 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          {submitting
            ? "Saving…"
            : mode === "edit"
              ? "Save draft offer"
              : "Create draft offer"}
        </button>
      </section>
    </div>
  );
}
