"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/listings/constants";
import type { AutocompleteSuggestion } from "@/lib/listings/types";

export function HomeValuationForm() {
  const searchParams = useSearchParams();
  const fromHero = searchParams.get("from") === "hero";
  const initialAddress = searchParams.get("address") ?? "";
  const initialCity = searchParams.get("city") ?? "Toronto";
  const initialLeadId = searchParams.get("leadId");
  const initialLow = searchParams.get("low");
  const initialHigh = searchParams.get("high");

  const heroEstimate = useMemo(() => {
    if (!initialLow || !initialHigh) return null;
    const low = Number(initialLow);
    const high = Number(initialHigh);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    return { low, high };
  }, [initialLow, initialHigh]);

  const [address, setAddress] = useState(initialAddress);
  const [city, setCity] = useState(initialCity);
  const [beds, setBeds] = useState("3");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [intent, setIntent] = useState<"sell" | "buy" | "curious">(
    fromHero ? "sell" : "curious",
  );
  const [pending, setPending] = useState(false);
  const [bookingPending, setBookingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(initialLeadId);
  const [result, setResult] = useState<{
    low: number;
    high: number;
    disclaimer: string;
  } | null>(
    heroEstimate
      ? {
          low: heroEstimate.low,
          high: heroEstimate.high,
          disclaimer:
            "Indicative range pulled using technology from nearby market activity — not a formal appraisal. Book an appointment for a precise valuation.",
        }
      : null,
  );

  function onPlace(suggestion: AutocompleteSuggestion) {
    setAddress(
      suggestion.city && suggestion.province
        ? `${suggestion.label}, ${suggestion.city}, ${suggestion.province}`
        : suggestion.label,
    );
    if (suggestion.city) setCity(suggestion.city);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!address.trim()) {
      setError("Please enter an address.");
      return;
    }
    setPending(true);
    setError(null);

    const res = await fetch("/api/valuation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address.trim(),
        city,
        beds: beds ? Number(beds) : undefined,
        name,
        email,
        phone: phone || undefined,
        intent,
        ...loadPersistedUtm(),
      }),
    });

    const data = (await res.json()) as {
      error?: string;
      leadId?: string;
      estimate?: { low: number; high: number; disclaimer: string };
    };
    setPending(false);

    if (!res.ok || !data.estimate) {
      setError(data.error ?? "Could not submit.");
      return;
    }

    if (data.leadId) setLeadId(data.leadId);
    setResult(data.estimate);
    setBooked(true);
  }

  async function bookAppointment() {
    if (!name.trim() || !email.trim()) {
      setError("Add your name and email so an agent can confirm the appointment.");
      return;
    }
    setBookingPending(true);
    setError(null);

    const res = await fetch("/api/valuation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address.trim() || initialAddress,
        city,
        name,
        email,
        phone: phone || undefined,
        intent: "sell",
        estimatedLow: result?.low,
        estimatedHigh: result?.high,
        ...loadPersistedUtm(),
      }),
    });
    const data = (await res.json()) as { error?: string; leadId?: string };
    setBookingPending(false);

    if (!res.ok) {
      setError(data.error ?? "Could not book appointment.");
      return;
    }
    if (data.leadId) setLeadId(data.leadId);
    setBooked(true);
  }

  if (result) {
    return (
      <div className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-canopy/30 bg-canopy/5 p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-canopy">
            Rough estimated value
          </p>
          <h2 className="font-display text-2xl text-ink">Indicative range</h2>
          <p className="text-3xl font-semibold text-canopy">
            {formatPrice(result.low)} – {formatPrice(result.high)}
          </p>
          {(address || initialAddress) && (
            <p className="text-sm text-ink/70">
              For {(address || initialAddress).trim()}
              {city ? ` · ${city}` : ""}
            </p>
          )}
          <p className="text-sm text-ink/65">{result.disclaimer}</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-line bg-surface p-6">
          <h3 className="font-display text-2xl text-ink">
            Get a more precise valuation
          </h3>
          <p className="text-sm text-ink/70">
            Technology gives a starting range. Book an appointment with a
            Houzzat agent for a refined market review of your home.
          </p>

          {booked ? (
            <div className="rounded-xl border border-canopy/25 bg-canopy/5 px-4 py-3 text-sm text-canopy-deep">
              Appointment request received
              {leadId ? ` (ref ${leadId.slice(0, 8)})` : ""}. An agent will
              follow up shortly.{" "}
              <Link href="/account" className="font-semibold underline">
                View your account
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  required
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  required
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Input
                placeholder="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button
                type="button"
                className="w-full"
                disabled={bookingPending}
                onClick={() => void bookAppointment()}
              >
                {bookingPending
                  ? "Booking…"
                  : "Book appointment for precise valuation"}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="space-y-2">
        <label className="text-sm font-medium">Property address</label>
        <AddressAutocomplete
          onPlaceSelect={onPlace}
          onQueryChange={setAddress}
          initialQuery={address}
          fillOnly
          source="google"
          minChars={2}
          placeholder="Enter your home address with unit# (if applicable)"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <Input
          placeholder="Beds"
          value={beds}
          onChange={(e) => setBeds(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["curious", "Just curious"],
            ["sell", "Thinking of selling"],
            ["buy", "Buying soon"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm ${
              intent === value
                ? "bg-canopy text-white"
                : "border border-line text-ink/70"
            }`}
            onClick={() => setIntent(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          required
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Input
        placeholder="Phone (optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Estimating…" : "Get Estimate"}
      </Button>
      <p className="text-xs text-ink/55">
        Estimated value is pulled using technology. Book an appointment for a
        precise valuation with a Houzzat agent.
      </p>
    </form>
  );
}
