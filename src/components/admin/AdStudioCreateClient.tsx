"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ListingOption = { mlsNumber: string; label: string };
type LandingOption = { slug: string; title: string };
type AreaOption = { slug: string; displayName: string };

export function AdStudioCreateClient({
  listings,
  landings,
  areas,
}: {
  listings: ListingOption[];
  landings: LandingOption[];
  areas: AreaOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("BUYER");
  const [platform, setPlatform] = useState("BOTH");
  const [sourceType, setSourceType] = useState("LISTING");
  const [sourceId, setSourceId] = useState(listings[0]?.mlsNumber ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sourceType === "LISTING" || sourceType === "OPEN_HOUSE") {
      setSourceId(listings[0]?.mlsNumber ?? "");
    } else if (sourceType === "LANDING") {
      setSourceId(landings[0]?.slug ?? "");
    } else if (sourceType === "AREA") {
      setSourceId(areas[0]?.slug ?? "");
    } else if (sourceType === "VALUATION") {
      setSourceId("gta");
    }
  }, [sourceType, listings, landings, areas]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/admin/ads/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        goal,
        platform,
        sourceType,
        sourceId,
      }),
    });
    const data = (await res.json()) as { error?: string; item?: { id: string } };
    setPending(false);
    if (!res.ok || !data.item) {
      setError(data.error ?? "Could not generate campaign.");
      return;
    }
    router.push(`/admin/ads/${data.item.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <Input
        required
        placeholder="Campaign name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-ink/70">Goal</span>
        <select
          className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        >
          <option value="BUYER">Buyer</option>
          <option value="SELLER">Seller</option>
          <option value="OPEN_HOUSE">Open house</option>
          <option value="VALUATION">Valuation</option>
          <option value="BRAND">Brand</option>
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-ink/70">Platform</span>
        <select
          className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="BOTH">Meta + Google</option>
          <option value="META">Meta only</option>
          <option value="GOOGLE">Google only</option>
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-ink/70">Source</span>
        <select
          className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
        >
          <option value="LISTING">Listing</option>
          <option value="OPEN_HOUSE">Open house listing</option>
          <option value="LANDING">Landing page</option>
          <option value="AREA">Area guide</option>
          <option value="VALUATION">Home valuation</option>
        </select>
      </label>

      {sourceType === "LISTING" || sourceType === "OPEN_HOUSE" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-ink/70">Listing</span>
          <select
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            {listings.map((l) => (
              <option key={l.mlsNumber} value={l.mlsNumber}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {sourceType === "LANDING" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-ink/70">Landing</span>
          <select
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            {landings.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.title} (/lp/{l.slug})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {sourceType === "AREA" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-ink/70">Area</span>
          <select
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            {areas.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {sourceType === "VALUATION" ? (
        <p className="text-sm text-ink/60">
          Destination will be /home-valuation with UTM tracking.
        </p>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || !sourceId}>
          {pending ? "Generating…" : "Generate creatives"}
        </Button>
        <Link
          href="/admin/ads"
          className="inline-flex items-center text-sm font-medium text-ink/60"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
