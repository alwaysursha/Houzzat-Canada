"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  OWNER_PRICING,
  calculateOwnerPricing,
  coopCommissionCopy,
  type OwnerAddonId,
} from "@/lib/owner/pricing";
import { formatPrice } from "@/lib/listings/constants";
import { cn } from "@/lib/utils";

type TitleParty = { fullName: string; licenseImageUrl: string };

export function OwnerListingForm({
  initialPhone = "",
}: {
  initialPhone?: string;
}) {
  const router = useRouter();
  const [transactionType, setTransactionType] = useState<"SALE" | "LEASE">(
    "SALE",
  );
  const [segment, setSegment] = useState<"RESIDENTIAL" | "COMMERCIAL">(
    "RESIDENTIAL",
  );
  const [propertyType, setPropertyType] = useState("DETACHED");
  const [listPrice, setListPrice] = useState("");
  const [beds, setBeds] = useState("3");
  const [baths, setBaths] = useState("2");
  const [sqft, setSqft] = useState("");
  const [parkingSpaces, setParking] = useState("1");
  const [addressLine, setAddress] = useState("");
  const [unitNumber, setUnit] = useState("");
  const [city, setCity] = useState("Toronto");
  const [community, setCommunity] = useState("");
  const [postalCode, setPostal] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState(initialPhone);
  const [addOns, setAddOns] = useState<OwnerAddonId[]>([]);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptCoop, setAcceptCoop] = useState(false);
  const [parties, setParties] = useState<TitleParty[]>([
    { fullName: "", licenseImageUrl: "" },
  ]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pricing = useMemo(
    () => calculateOwnerPricing({ transactionType, addOns }),
    [transactionType, addOns],
  );

  function toggleAddon(id: OwnerAddonId) {
    setAddOns((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function uploadFile(file: File, kind: "licenses" | "photos") {
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    const res = await fetch("/api/owner/upload", { method: "POST", body });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
    return data.url;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionType,
          segment,
          propertyType,
          listPrice: Number(listPrice),
          beds: Number(beds),
          baths: Number(baths),
          sqft: sqft ? Number(sqft) : null,
          parkingSpaces: Number(parkingSpaces) || 0,
          addressLine,
          unitNumber: unitNumber || null,
          city,
          community: community || null,
          postalCode: postalCode || null,
          lat: 43.6532,
          lng: -79.3832,
          description,
          phone,
          addOns,
          acceptTerms,
          acceptCoop,
          titleParties: parties,
          photoUrls,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        checkoutUrl?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not create listing.");
        setPending(false);
        return;
      }
      router.push(data.checkoutUrl ?? "/owner");
      router.refresh();
    } catch {
      setError("Could not create listing.");
      setPending(false);
    }
  }

  const addonOptions: {
    id: OwnerAddonId;
    label: string;
    price: number;
    saleOnly?: boolean;
  }[] = [
    { id: "CLEANING", label: "Professional cleaning", price: OWNER_PRICING.cleaning },
    {
      id: "STAGING",
      label: "Staging",
      price: OWNER_PRICING.staging,
      saleOnly: true,
    },
    {
      id: "PHOTOGRAPHY",
      label: "Professional photography",
      price: OWNER_PRICING.photography,
    },
    {
      id: "VIDEOGRAPHY",
      label: addOns.includes("PHOTOGRAPHY")
        ? "Professional videography (bundle $349)"
        : "Professional videography",
      price: addOns.includes("PHOTOGRAPHY")
        ? OWNER_PRICING.videographyWithPhoto
        : OWNER_PRICING.videography,
    },
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">Listing type</h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["SALE", "For sale (FSBO)"],
              ["LEASE", "For lease (FLBO)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTransactionType(value);
                if (value === "LEASE") {
                  setAddOns((prev) => prev.filter((a) => a !== "STAGING"));
                }
              }}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold",
                transactionType === value
                  ? "bg-canopy text-white"
                  : "border border-line text-ink/70",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["RESIDENTIAL", "Residential"],
              ["COMMERCIAL", "Commercial"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSegment(value)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold",
                segment === value
                  ? "bg-ink text-white"
                  : "border border-line text-ink/70",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
        <h2 className="font-display text-2xl text-ink sm:col-span-2">
          Property details
        </h2>
        <label className="space-y-1 text-sm">
          Address
          <Input value={addressLine} onChange={(e) => setAddress(e.target.value)} required />
        </label>
        <label className="space-y-1 text-sm">
          Unit
          <Input value={unitNumber} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          City
          <Input value={city} onChange={(e) => setCity(e.target.value)} required />
        </label>
        <label className="space-y-1 text-sm">
          Community
          <Input value={community} onChange={(e) => setCommunity(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          Postal code
          <Input value={postalCode} onChange={(e) => setPostal(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          Property type
          <select
            className="flex h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
          >
            {[
              "DETACHED",
              "SEMI_DETACHED",
              "TOWNHOUSE",
              "CONDO_APT",
              "CONDO_TOWNHOUSE",
              "MULTIPLEX",
              "VACANT_LAND",
              "OFFICE",
              "RETAIL",
              "INDUSTRIAL",
              "MIXED_USE",
              "OTHER",
            ].map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          {transactionType === "LEASE" ? "Monthly rent" : "Asking price"}
          <Input
            type="number"
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          Beds
          <Input type="number" value={beds} onChange={(e) => setBeds(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          Baths
          <Input type="number" value={baths} onChange={(e) => setBaths(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          Sqft
          <Input type="number" value={sqft} onChange={(e) => setSqft(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          Parking
          <Input
            type="number"
            value={parkingSpaces}
            onChange={(e) => setParking(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          Description
          <textarea
            className="min-h-28 w-full rounded-lg border border-line px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minLength={20}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">Photos</h2>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            void (async () => {
              const urls: string[] = [];
              for (const file of files) {
                urls.push(await uploadFile(file, "photos"));
              }
              setPhotoUrls((prev) => [...prev, ...urls]);
            })();
          }}
        />
        {photoUrls.length > 0 ? (
          <p className="text-sm text-ink/60">{photoUrls.length} photo(s) uploaded</p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">Contact & title holders</h2>
        <label className="block space-y-1 text-sm">
          Phone
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        {parties.map((party, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              Full legal name on title
              <Input
                value={party.fullName}
                onChange={(e) => {
                  const next = [...parties];
                  next[index] = { ...party, fullName: e.target.value };
                  setParties(next);
                }}
                required
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              Driver’s license image
              <input
                type="file"
                accept="image/*"
                required={!party.licenseImageUrl}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void (async () => {
                    const url = await uploadFile(file, "licenses");
                    const next = [...parties];
                    next[index] = { ...party, licenseImageUrl: url };
                    setParties(next);
                  })();
                }}
              />
              {party.licenseImageUrl ? (
                <span className="text-xs text-canopy">Uploaded</span>
              ) : null}
            </label>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setParties((prev) => [...prev, { fullName: "", licenseImageUrl: "" }])
          }
        >
          Add another person on title
        </Button>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">Add-on services</h2>
        <ul className="space-y-2">
          {addonOptions.map((opt) => {
            if (opt.saleOnly && transactionType !== "SALE") return null;
            const on = addOns.includes(opt.id);
            return (
              <li key={opt.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleAddon(opt.id)}
                    />
                    {opt.label}
                  </span>
                  <span className="font-semibold">{formatPrice(opt.price)}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="rounded-xl bg-mist px-4 py-3 text-sm">
          <p>
            Base listing:{" "}
            <strong>{formatPrice(pricing.baseAmount)}</strong>
          </p>
          {pricing.addOnLines.map((line) => (
            <p key={line.id}>
              {line.label}: {formatPrice(line.amount)}
            </p>
          ))}
          {pricing.discountAmount > 0 ? (
            <p className="text-canopy">
              Bundle savings included vs list videography
            </p>
          ) : null}
          <p className="mt-2 text-base font-semibold">
            Total due: {formatPrice(pricing.totalAmount)}
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">Agreements</h2>
        <label className="flex items-start gap-3 text-sm text-ink/80">
          <input
            type="checkbox"
            className="mt-1"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            required
          />
          <span>
            I agree to Houzzat FSBO/FLBO listing terms (placeholder v
            2026-07-1). Listings are reviewed by Houzzat admin before they go
            live.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-ink/80">
          <input
            type="checkbox"
            className="mt-1"
            checked={acceptCoop}
            onChange={(e) => setAcceptCoop(e.target.checked)}
            required
          />
          <span>{coopCommissionCopy(transactionType)}</span>
        </label>
      </section>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Submitting…" : "Continue to payment"}
      </Button>
    </form>
  );
}
