"use client";

import { BrandLogoMark } from "@/components/tenancy/BrandLogoMark";
import type { WorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import {
  HOUZZATPRO_PLATFORM_URL,
  POWERED_BY_HOUZZATPRO_LABEL,
  buildTenantFooterModel,
} from "@/lib/tenancy/platform-footer";

type ShareStop = {
  sortOrder: number;
  mlsNumber: string;
  driveFromPrevSeconds: number | null;
  suggestedArriveAt: string | null;
  listing: {
    addressLine: string;
    unitNumber: string | null;
    city: string;
    primaryImageUrl: string | null;
  } | null;
};

type ShareTour = {
  viewingDate: string | null;
  startAddress: string | null;
  summary: {
    stopCount: number;
    totalMeters: number;
    totalDriveSeconds: number;
  };
  stops: ShareStop[];
};

function formatDrive(seconds: number | null) {
  if (seconds == null) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min drive`;
}

function formatTime(iso: string | null) {
  if (!iso) return "Time TBD";
  return new Date(iso).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string | null) {
  if (!iso) return "Date TBD";
  return new Date(iso).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function formatTotalDrive(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min driving`;
  return `${m} min driving`;
}

export function ViewingShareClient({
  tour,
  brand,
  agent,
}: {
  tour: ShareTour;
  brand: WorkspaceBrandPublic;
  agent: { name: string | null; email: string | null; phone: string | null } | null;
}) {
  const footer = buildTenantFooterModel(brand);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-8 sm:px-6">
      <header className="space-y-4 border-b border-[var(--line)] pb-6">
        <div className="flex items-center gap-3">
          <BrandLogoMark
            displayName={brand.displayName}
            logoUrl={brand.logoUrl}
            primaryColor={brand.colors.primary}
            size="md"
          />
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--ink)]">
              {brand.displayName}
            </h1>
            {brand.tagline ? (
              <p className="text-sm text-[var(--ink)]/60">{brand.tagline}</p>
            ) : null}
          </div>
        </div>

        {agent?.name || agent?.phone || agent?.email ? (
          <div className="rounded-lg border border-[var(--line)] bg-white/80 px-4 py-3 text-sm">
            {agent.name ? (
              <p className="font-semibold text-[var(--ink)]">{agent.name}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[var(--ink)]/70">
              {agent.phone ? <span>{agent.phone}</span> : null}
              {agent.email ? <span>{agent.email}</span> : null}
            </div>
          </div>
        ) : null}
      </header>

      <main className="flex-1 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink)]/45">
          Viewing Schedule
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold text-[var(--ink)]">
          {formatDate(tour.viewingDate)}
        </h2>
        {tour.startAddress ? (
          <p className="mt-2 text-sm text-[var(--ink)]/65">
            Starting from {tour.startAddress}
          </p>
        ) : null}

        <div className="mt-4 rounded-lg bg-[var(--tenant-primary)]/10 px-4 py-3 text-sm font-semibold text-[var(--tenant-primary-strong)]">
          {tour.summary.stopCount} viewings · {formatDistance(tour.summary.totalMeters)} ·{" "}
          {formatTotalDrive(tour.summary.totalDriveSeconds)}
        </div>

        <ol className="mt-6 space-y-0">
          {[...tour.stops]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((stop, index) => {
            const addr = stop.listing
              ? [
                  stop.listing.unitNumber
                    ? `${stop.listing.unitNumber} – ${stop.listing.addressLine}`
                    : stop.listing.addressLine,
                  stop.listing.city,
                ]
                  .filter(Boolean)
                  .join(", ")
              : stop.mlsNumber;
            const drive = formatDrive(stop.driveFromPrevSeconds);

            return (
              <li key={`${stop.mlsNumber}-${stop.sortOrder}`}>
                {index > 0 && drive ? (
                  <div className="flex justify-center py-2 text-xs font-medium text-[var(--ink)]/45">
                    ↓ {drive}
                  </div>
                ) : null}
                <div className="flex gap-3 rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm">
                  {stop.listing?.primaryImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- MLS thumbnail
                    <img
                      src={stop.listing.primaryImageUrl}
                      alt=""
                      className="size-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-[var(--mist)] text-lg font-bold text-[var(--tenant-primary)]">
                      {stop.sortOrder + 1}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[var(--tenant-primary)]">
                      {formatTime(stop.suggestedArriveAt)}
                    </p>
                    <p className="mt-1 text-sm font-medium text-[var(--ink)]">{addr}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </main>

      <footer className="mt-auto border-t border-[var(--line)] pt-6 text-center text-xs text-[var(--ink)]/50">
        {footer.tenantLegalText ? (
          <p className="mb-3 whitespace-pre-line">{footer.tenantLegalText}</p>
        ) : null}
        <p>
          <a
            href={footer.platformCredit.href}
            className="underline-offset-2 hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            {POWERED_BY_HOUZZATPRO_LABEL}
          </a>
        </p>
      </footer>
    </div>
  );
}
