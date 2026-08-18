import Link from "next/link";
import { Suspense } from "react";
import {
  loadAdminJourneyFeed,
  loadAdminMlsPulse,
  loadAdminSecondaryCounts,
} from "@/lib/admin/hq-deferred";

function formatEventTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleTimeString("en-CA", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number | string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/40">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl text-ink">{value}</p>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl border border-line/80 bg-surface/90 p-4 shadow-[0_1px_0_rgb(20_32_28/0.03)] transition hover:border-canopy/35 sm:p-5"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-2xl border border-line/80 bg-surface/90 p-4 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-5">
      {inner}
    </div>
  );
}

export function AdminJourneyFeedSkeleton() {
  return (
    <div
      className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5"
      aria-busy="true"
      aria-label="Loading journey feed"
    >
      <div className="h-5 w-40 animate-pulse rounded bg-ink/10" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-line/50 pb-3 last:border-0 last:pb-0"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-[70%] max-w-xs animate-pulse rounded bg-ink/10" />
              <div className="h-2.5 w-[45%] max-w-[12rem] animate-pulse rounded bg-ink/10" />
            </div>
            <div className="h-2.5 w-10 shrink-0 animate-pulse rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminSecondarySidebarSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading growth stats">
      <div className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
        <div className="h-2.5 w-16 animate-pulse rounded bg-ink/10" />
        <div className="mt-3 h-8 w-14 animate-pulse rounded bg-ink/10" />
      </div>
      <div className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
        <div className="h-2.5 w-20 animate-pulse rounded bg-ink/10" />
        <div className="mt-3 h-8 w-14 animate-pulse rounded bg-ink/10" />
      </div>
    </div>
  );
}

export function AdminMlsSyncSkeleton() {
  return (
    <div
      className="rounded-2xl border border-line/80 bg-surface/90 p-5"
      aria-busy="true"
      aria-label="Loading MLS sync"
    >
      <div className="h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-ink/10" />
        <div className="h-3 w-[80%] animate-pulse rounded bg-ink/10" />
      </div>
    </div>
  );
}

async function AdminJourneyFeedBody() {
  const recentEvents = await loadAdminJourneyFeed();

  return (
    <div className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ink">Live journey feed</h2>
        <Link
          href="/admin/visitors"
          className="text-xs font-semibold text-canopy hover:underline"
        >
          Open visitors →
        </Link>
      </div>
      <ul className="mt-4 divide-y divide-line/70">
        {recentEvents.length === 0 ? (
          <li className="py-8 text-center text-sm text-ink/50">
            No tracked activity yet. Browse the public site to seed the feed.
          </li>
        ) : (
          recentEvents.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {event.type.replaceAll("_", " ")}
                  {event.mlsNumber ? ` · ${event.mlsNumber}` : ""}
                </p>
                <p className="truncate text-xs text-ink/45">
                  {event.user?.email ||
                    (event.visitor
                      ? `Visitor ${event.visitor.visitorKey.slice(0, 8)}…`
                      : "Anonymous")}
                  {event.path ? ` · ${event.path}` : ""}
                </p>
              </div>
              <time className="shrink-0 text-xs text-ink/40">
                {formatEventTime(event.createdAt)}
              </time>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

async function AdminMlsSyncBody() {
  const sync = await loadAdminMlsPulse();

  return (
    <div className="rounded-2xl border border-line/80 bg-surface/90 p-5">
      <h2 className="font-semibold text-ink">MLS sync</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink/45">Provider</dt>
          <dd className="font-medium uppercase">{sync.provider}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink/45">Listings</dt>
          <dd className="font-medium">{sync.listingCount}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink/55">{sync.message}</p>
    </div>
  );
}

async function AdminSecondarySidebarBody() {
  const counts = await loadAdminSecondaryCounts();

  return (
    <div className="space-y-4">
      <StatCard label="Landings" value={counts.landingCount} href="/admin/landings" />
      <StatCard label="Ad campaigns" value={counts.adCount} href="/admin/ads" />
    </div>
  );
}

export function AdminDeferredJourneyFeed() {
  return (
    <div className="lg:col-span-2">
      <Suspense fallback={<AdminJourneyFeedSkeleton />}>
        <AdminJourneyFeedBody />
      </Suspense>
    </div>
  );
}

export function AdminDeferredSecondarySidebar() {
  return (
    <Suspense fallback={<AdminSecondarySidebarSkeleton />}>
      <AdminSecondarySidebarBody />
    </Suspense>
  );
}

export function AdminDeferredMlsSync() {
  return (
    <Suspense fallback={<AdminMlsSyncSkeleton />}>
      <AdminMlsSyncBody />
    </Suspense>
  );
}
