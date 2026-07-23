"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ListingOpt = {
  mlsNumber: string;
  label: string;
  lat: number;
  lng: number;
  city: string;
  community: string | null;
  beds: number;
  baths: number;
  addressLine: string;
};

type Report = {
  id: string;
  token: string;
  subjectAddress: string | null;
  city: string;
  createdAt: string;
};

export function CmaClient({ listings }: { listings: ListingOpt[] }) {
  const [mls, setMls] = useState(listings[0]?.mlsNumber ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);

  async function loadReports() {
    const res = await fetch("/api/agent/cma");
    if (!res.ok) return;
    const data = (await res.json()) as { items: Report[] };
    setReports(data.items ?? []);
  }

  useEffect(() => {
    void loadReports();
  }, []);

  async function generate() {
    const listing = listings.find((l) => l.mlsNumber === mls);
    if (!listing) return;
    setPending(true);
    setMessage(null);
    const res = await fetch("/api/agent/cma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingMls: listing.mlsNumber,
        address: listing.addressLine,
        city: listing.city,
        community: listing.community ?? undefined,
        beds: listing.beds,
        baths: listing.baths,
        lat: listing.lat,
        lng: listing.lng,
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      shareUrl?: string;
      summary?: string;
    };
    setPending(false);
    if (!res.ok) {
      setMessage(data.error ?? "Could not generate CMA.");
      return;
    }
    setShareUrl(data.shareUrl ?? null);
    setSummary(data.summary ?? null);
    setMessage("CMA draft ready.");
    await loadReports();
  }

  return (
    <div className="space-y-8">
      <div className="max-w-xl space-y-3 rounded-2xl border border-line bg-surface p-5">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Subject listing</span>
          <select
            className="w-full rounded-lg border border-line px-3 py-2"
            value={mls}
            onChange={(e) => setMls(e.target.value)}
          >
            {listings.map((l) => (
              <option key={l.mlsNumber} value={l.mlsNumber}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={() => void generate()} disabled={pending || !mls}>
          {pending ? "Building…" : "Generate CMA draft"}
        </Button>
        {message ? <p className="text-sm text-ink/65">{message}</p> : null}
        {summary ? <p className="text-sm text-ink/80">{summary}</p> : null}
        {shareUrl ? (
          <div className="space-y-2">
            <Input readOnly value={shareUrl} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(shareUrl)}
            >
              Copy share link
            </Button>
          </div>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Recent CMAs</h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {reports.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <span>
                {r.subjectAddress ?? "Subject"} · {r.city}
              </span>
              <Link href={`/cma/${r.token}`} className="text-canopy">
                Open →
              </Link>
            </li>
          ))}
          {reports.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink/50">No CMAs yet.</li>
          ) : null}
        </ul>
        <p className="text-xs text-ink/45">
          Draft for internal sharing. Sold comps reflect inventory with sold
          prices — review VOW display rules before sending to clients.
        </p>
      </section>
    </div>
  );
}
