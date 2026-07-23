"use client";

import { useMemo, useState } from "react";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  estimateAffordability,
  type AffordabilityResult,
} from "@/lib/market/affordability";
import { formatPrice } from "@/lib/listings/constants";

export function AffordabilityCalculator() {
  const [income, setIncome] = useState("120000");
  const [downPayment, setDownPayment] = useState("100000");
  const [rate, setRate] = useState("4.29");
  const [amort, setAmort] = useState("25");
  const [tax, setTax] = useState("4500");
  const [condo, setCondo] = useState("0");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<AffordabilityResult | null>(null);
  const [leadDone, setLeadDone] = useState(false);
  const [pending, setPending] = useState(false);

  const preview = useMemo(() => {
    return estimateAffordability({
      income: Number(income) || 0,
      downPayment: Number(downPayment) || 0,
      ratePct: Number(rate) || 0,
      amortYears: Number(amort) || 25,
      propertyTaxAnnual: Number(tax) || 0,
      condoFeeMonthly: Number(condo) || 0,
    });
  }, [income, downPayment, rate, amort, tax, condo]);

  function onCalculate(event: React.FormEvent) {
    event.preventDefault();
    setResult(preview);
  }

  async function onCaptureLead() {
    if (!name || !email || !result) return;
    setPending(true);
    await fetch("/api/tools/affordability-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        maxPurchase: result.maxPurchase,
        income: Number(income),
        ...loadPersistedUtm(),
      }),
    });
    setPending(false);
    setLeadDone(true);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={onCalculate} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Your numbers</h2>
        <Input
          required
          type="number"
          placeholder="Household income (annual)"
          value={income}
          onChange={(e) => setIncome(e.target.value)}
        />
        <Input
          required
          type="number"
          placeholder="Down payment"
          value={downPayment}
          onChange={(e) => setDownPayment(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            step="0.01"
            placeholder="Rate %"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Amortization years"
            value={amort}
            onChange={(e) => setAmort(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            placeholder="Property tax / year"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Condo fee / month"
            value={condo}
            onChange={(e) => setCondo(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full">
          Calculate
        </Button>
      </form>

      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">Illustrative max</h2>
        <p className="font-display text-4xl text-canopy">
          {formatPrice((result ?? preview).maxPurchase)}
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-ink/45">Monthly housing</dt>
            <dd className="font-medium">
              {formatPrice((result ?? preview).monthlyHousing)}
            </dd>
          </div>
          <div>
            <dt className="text-ink/45">Est. GDS</dt>
            <dd className="font-medium">{(result ?? preview).gdsPct}%</dd>
          </div>
        </dl>
        <p className="text-xs text-ink/50">{(result ?? preview).disclaimer}</p>

        {result && !leadDone ? (
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm text-ink/70">
              Want homes in this range? Leave your email — an agent can follow
              up (optional).
            </p>
            <Input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !name || !email}
              onClick={() => void onCaptureLead()}
            >
              {pending ? "Sending…" : "Send me matches"}
            </Button>
          </div>
        ) : null}
        {leadDone ? (
          <p className="text-sm text-canopy">Thanks — we’ll be in touch.</p>
        ) : null}
      </div>
    </div>
  );
}
