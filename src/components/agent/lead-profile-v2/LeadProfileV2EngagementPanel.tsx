"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { EngagementMatchboard } from "@/components/agent/EngagementMatchboard";
import { SavedSearchEditor } from "@/components/agent/SavedSearchEditor";
import { formatV2RoutePlannerTourStopsPhrase } from "@/lib/agent/lead-profile-v2/route-planner-query";
import type {
  LeadProfileV2AlertsPanel,
  LeadProfileV2AreaMonitorsPanel,
  LeadProfileV2EngagementOverview,
  LeadProfileV2ListingNotesPanel,
  LeadProfileV2PropertyWatchesPanel,
  LeadProfileV2RoutePlannerPanel,
  LeadProfileV2SavedHomesPanel,
  LeadProfileV2SavedSearchesPanel,
} from "@/lib/agent/lead-profile-v2/types";
import { cn } from "@/lib/utils";

export function LeadProfileV2EngagementPanel({
  leadId,
  consented,
  customerEmail,
  panel,
  loading,
  error,
  savedSearches,
  savedSearchesLoading,
  savedSearchesError,
  savedHomes,
  savedHomesLoading,
  savedHomesError,
  propertyWatches,
  propertyWatchesLoading,
  propertyWatchesError,
  areaMonitors,
  areaMonitorsLoading,
  areaMonitorsError,
  routePlanner,
  routePlannerLoading,
  routePlannerError,
  listingNotes,
  listingNotesLoading,
  listingNotesError,
  alerts,
  alertsLoading,
  alertsError,
  onMatchboardUpdated,
  onSavedSearchUpdated,
}: {
  leadId: string;
  consented: boolean;
  customerEmail: string | null;
  panel: LeadProfileV2EngagementOverview | null;
  loading: boolean;
  error: boolean;
  savedSearches: LeadProfileV2SavedSearchesPanel | null;
  savedSearchesLoading: boolean;
  savedSearchesError: boolean;
  savedHomes: LeadProfileV2SavedHomesPanel | null;
  savedHomesLoading: boolean;
  savedHomesError: boolean;
  propertyWatches: LeadProfileV2PropertyWatchesPanel | null;
  propertyWatchesLoading: boolean;
  propertyWatchesError: boolean;
  areaMonitors: LeadProfileV2AreaMonitorsPanel | null;
  areaMonitorsLoading: boolean;
  areaMonitorsError: boolean;
  routePlanner: LeadProfileV2RoutePlannerPanel | null;
  routePlannerLoading: boolean;
  routePlannerError: boolean;
  listingNotes: LeadProfileV2ListingNotesPanel | null;
  listingNotesLoading: boolean;
  listingNotesError: boolean;
  alerts: LeadProfileV2AlertsPanel | null;
  alertsLoading: boolean;
  alertsError: boolean;
  onMatchboardUpdated: () => void;
  onSavedSearchUpdated: () => void;
}) {
  return (
    <div className="space-y-4">
      {loading ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
          Loading…
        </p>
      ) : error ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
          Failed to load
        </p>
      ) : !panel ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
          Loading…
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Views (24h)", panel.stats.views24h],
                ["Saved homes", panel.stats.saves],
                ["Alerts", panel.stats.alerts],
                ["Emails sent", panel.stats.emails],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-[#bae6fd] bg-[#e0f2fe] px-4 py-3"
              >
                <p className="text-2xl font-bold text-[#0c4a6e]">{value}</p>
                <p className="text-[12px] font-semibold text-[#0284c7]">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {panel.buyerIntent ? (
            <Panel title="Criteria · matches · shortlist">
              <EngagementMatchboard
                leadId={leadId}
                buyerIntent={panel.buyerIntent}
                savedSearches={
                  panel.matchboardSearch ? [panel.matchboardSearch] : []
                }
                consented={consented}
                customerEmail={customerEmail}
                onUpdated={onMatchboardUpdated}
              />
            </Panel>
          ) : null}
        </>
      )}

      <Panel title="Saved searches / homepage">
        {savedSearchesLoading ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Loading…
          </p>
        ) : savedSearchesError ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Failed to load
          </p>
        ) : (savedSearches?.savedSearches.length ?? 0) === 0 ? (
          <p className="text-[13px] text-[#94a3b8]">
            No saved searches yet — use “Save as search” above to create one from
            Looking for, or the customer can personalize their homepage.
          </p>
        ) : (
          <div className="space-y-3">
            {(savedSearches?.savedSearches ?? []).map((s) => (
              <div key={s.id} className="space-y-1.5">
                {s.isHomepageActive ? (
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#047857]">
                    Active homepage search
                  </p>
                ) : null}
                <SavedSearchEditor
                  leadId={leadId}
                  search={s}
                  onUpdated={onSavedSearchUpdated}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Saved homes">
        {savedHomesLoading ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Loading…
          </p>
        ) : savedHomesError ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Failed to load
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(savedHomes?.savedListings.length ?? 0) === 0 ? (
              <span className="text-[13px] text-[#94a3b8]">None</span>
            ) : (
              (savedHomes?.savedListings ?? []).map((s) => (
                <Link
                  key={s.id}
                  href={`/listing/${s.mlsNumber}`}
                  className="rounded-md bg-[#eef2f6] px-2 py-0.5 text-[12px] font-semibold text-[#2b6cb0] hover:underline"
                >
                  {s.mlsNumber}
                </Link>
              ))
            )}
          </div>
        )}
      </Panel>

      <Panel title="Property watches">
        {propertyWatchesLoading ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Loading…
          </p>
        ) : propertyWatchesError ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Failed to load
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(propertyWatches?.propertyMonitors.length ?? 0) === 0 ? (
              <span className="text-[13px] text-[#94a3b8]">None</span>
            ) : (
              (propertyWatches?.propertyMonitors ?? []).map((m) => (
                <Link
                  key={m.id}
                  href={`/listing/${m.mlsNumber}`}
                  className="rounded-md bg-[#eef2f6] px-2 py-0.5 text-[12px] font-semibold text-[#2b6cb0] hover:underline"
                >
                  {m.mlsNumber}
                </Link>
              ))
            )}
          </div>
        )}
      </Panel>

      <Panel title="Area monitors">
        {areaMonitorsLoading ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Loading…
          </p>
        ) : areaMonitorsError ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Failed to load
          </p>
        ) : (
          <p className="text-[13px] text-[#475569]">
            {(areaMonitors?.areaMonitors.length ?? 0) === 0
              ? "None"
              : (areaMonitors?.areaMonitors ?? [])
                  .map((a) => a.name || a.city || a.id.slice(0, 8))
                  .join(" · ")}
          </p>
        )}
      </Panel>

      <Panel title="Route planner">
        {routePlannerLoading ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Loading…
          </p>
        ) : routePlannerError ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Failed to load
          </p>
        ) : (routePlanner?.tours.length ?? 0) === 0 ? (
          <p className="text-[13px] text-[#94a3b8]">No tours</p>
        ) : (
          <div className="space-y-1">
            {(routePlanner?.tours ?? []).map((t) => (
              <p
                key={t.id}
                className="text-[12px] text-[#475569]"
              >
                {t.name} · {t.status} · {formatV2RoutePlannerTourStopsPhrase(t)}
              </p>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Customer listing notes">
        {listingNotesLoading ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Loading…
          </p>
        ) : listingNotesError ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Failed to load
          </p>
        ) : (listingNotes?.listingNotes.length ?? 0) === 0 ? (
          <p className="text-[13px] text-[#94a3b8]">None</p>
        ) : (
          <div className="space-y-1">
            {(listingNotes?.listingNotes ?? []).map((n) => (
              <p
                key={n.id}
                className="text-[12px] text-[#475569]"
              >
                <Link
                  href={`/listing/${n.mlsNumber}`}
                  className="font-semibold text-[#2b6cb0] hover:underline"
                >
                  {n.mlsNumber}
                </Link>
                : {n.body.slice(0, 120)}
              </p>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Alerts inbox">
        {alertsLoading ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Loading…
          </p>
        ) : alertsError ? (
          <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
            Failed to load
          </p>
        ) : (
          <p className="text-[13px] text-[#475569]">
            {(alerts?.alerts.length ?? 0) === 0
              ? "None"
              : `${alerts?.alerts.length} recent · latest: ${alerts?.alerts[0]?.title || alerts?.alerts[0]?.kind}`}
          </p>
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[#e2e8f0] bg-white px-4 py-3",
        className,
      )}
    >
      <h3 className="mb-3 text-[13px] font-bold text-[#1e2a38]">{title}</h3>
      {children}
    </section>
  );
}
