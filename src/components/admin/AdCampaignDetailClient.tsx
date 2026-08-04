"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Creative = {
  id: string;
  platform: string;
  headlines: string[];
  primaryTexts: string[];
  descriptions: string[];
  imageUrls: string[];
  imagePresets: unknown;
};

type Campaign = {
  id: string;
  name: string;
  goal: string;
  platform: string;
  status: string;
  sourceType: string;
  sourceId: string;
  destinationUrl: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  complianceNotes: string[];
  creatives: Creative[];
  _count: { leads: number };
};

export function AdCampaignDetailClient({
  initial,
}: {
  initial: Campaign;
}) {
  const [campaign, setCampaign] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setMessage("Copied to clipboard.");
  }

  async function exportCsv() {
    window.location.href = `/api/admin/ads/campaigns/${campaign.id}?format=csv`;
    setCampaign((c) => ({ ...c, status: "EXPORTED" }));
  }

  async function publishStub() {
    setPending(true);
    setMessage(null);
    const res = await fetch(
      `/api/admin/ads/campaigns/${campaign.id}/publish`,
      { method: "POST" },
    );
    const data = (await res.json()) as {
      message?: string;
      checklist?: string[];
    };
    setPending(false);
    setMessage(
      [data.message, ...(data.checklist ?? [])].filter(Boolean).join(" · "),
    );
    setCampaign((c) => ({ ...c, status: "PUBLISH_STUB" }));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/ads" className="text-sm font-medium text-canopy">
            ← Ad Studio
          </Link>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-ink sm:text-4xl">
            {campaign.name}
          </h1>
          <p className="mt-1 text-sm text-ink/55">
            {campaign.goal} · {campaign.platform} · {campaign.status} ·{" "}
            {campaign._count.leads} attributed leads
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void exportCsv()}>
            Export CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void copy(campaign.destinationUrl)}
          >
            Copy tracked URL
          </Button>
          <Button
            type="button"
            onClick={() => void publishStub()}
            disabled={pending}
          >
            {pending ? "…" : "Publish draft (stub)"}
          </Button>
        </div>
      </div>

      {message ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink/70">
          {message}
        </p>
      ) : null}

      <section className="space-y-2 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Destination & UTM</h2>
        <p className="break-all text-sm text-canopy">{campaign.destinationUrl}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink/45">utm_source</dt>
            <dd className="font-medium">{campaign.utmSource}</dd>
          </div>
          <div>
            <dt className="text-ink/45">utm_medium</dt>
            <dd className="font-medium">{campaign.utmMedium}</dd>
          </div>
          <div>
            <dt className="text-ink/45">utm_campaign</dt>
            <dd className="font-medium">{campaign.utmCampaign}</dd>
          </div>
          <div>
            <dt className="text-ink/45">utm_content</dt>
            <dd className="font-medium">{campaign.utmContent}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-2 rounded-2xl border border-amber/30 bg-amber/5 p-5">
        <h2 className="font-semibold text-ink">Compliance checklist</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink/70">
          {campaign.complianceNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      {campaign.creatives.map((creative) => (
        <section
          key={creative.id}
          className="space-y-4 rounded-2xl border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl text-ink">
              {creative.platform === "META" ? "Meta" : "Google"} pack
            </h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                void copy(
                  [
                    ...creative.headlines.map((h) => `H: ${h}`),
                    ...creative.primaryTexts.map((t) => `P: ${t}`),
                    ...creative.descriptions.map((d) => `D: ${d}`),
                  ].join("\n"),
                )
              }
            >
              Copy all copy
            </Button>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/45">
              Headlines
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {creative.headlines.map((h) => (
                <li key={h} className="rounded-lg bg-mist px-3 py-2">
                  {h}
                </li>
              ))}
            </ul>
          </div>

          {creative.primaryTexts.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                Primary text
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-ink/80">
                {creative.primaryTexts.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/45">
              Descriptions
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {creative.descriptions.map((d) => (
                <li key={d} className="rounded-lg bg-mist px-3 py-2">
                  {d}
                </li>
              ))}
            </ul>
          </div>

          {creative.imageUrls[0] ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                Creative image (crop in Ads Manager)
              </h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={creative.imageUrls[0]}
                alt=""
                className="mt-2 max-h-48 rounded-xl object-cover"
              />
              <p className="mt-2 text-xs text-ink/50">
                Presets: 1080×1080, 1200×628, 1080×1920, 300×250 — crop from
                listing photo in Meta/Google UIs (R2 crop pipeline later).
              </p>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
