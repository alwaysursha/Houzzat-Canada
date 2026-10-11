import {
  PlatformEmptyState,
  PlatformErrorState,
  PlatformPanel,
  PlatformStatCard,
  PlatformStatGrid,
} from "@/components/platform/PlatformUi";
import { formatConversionPercent } from "@/lib/platform/funnel-analytics";
import type { FunnelAnalyticsReport } from "@/lib/platform/funnel-analytics";

const CHANNEL_LABELS: Record<string, string> = {
  google_ads: "Google Ads / paid search",
  organic: "Organic search",
  direct: "Direct",
  referral: "Referral",
  social: "Social",
  unknown: "Other / unknown",
};

const ENGAGEMENT_LABELS: Record<string, string> = {
  SAVE_LISTING: "Save listing",
  SAVE_SEARCH: "Save search",
  PROPERTY_WATCH: "Property watch",
  AREA_WATCH: "Area watch",
  REQUEST_VIEWING: "Request viewing",
  CONTACT_AGENT: "Contact agent",
};

type FunnelAnalyticsSectionProps = {
  report: FunnelAnalyticsReport | null;
  errorMessage: string | null;
};

export function FunnelAnalyticsSection({
  report,
  errorMessage,
}: FunnelAnalyticsSectionProps) {
  return (
    <section className="mt-10 space-y-6 border-t border-slate-800 pt-10">
      <div>
        <h2 className="text-xl font-semibold text-white">
          Conversion funnel
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Three reporting lenses are shown separately — they are not one
          sequential funnel. Acquisition applies to registered converters only;
          anonymous visitor UTMs are not stored on FunnelEvent.
        </p>
      </div>

      {errorMessage ? (
        <PlatformErrorState
          title="Conversion funnel unavailable"
          message={errorMessage}
        />
      ) : !report ? (
        <PlatformEmptyState message="Loading conversion funnel…" />
      ) : (
        <FunnelReportBody report={report} />
      )}
    </section>
  );
}

function FunnelReportBody({ report }: { report: FunnelAnalyticsReport }) {
  const hasAnyEvents = report.stages.some(
    (s) => s.status === "available" && s.eventCount > 0,
  );

  return (
    <div className="space-y-6">
      {!report.meta.trackingEnabled ? (
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200/90">
          Funnel tracking is disabled (
          <code className="text-xs">FUNNEL_EVENTS_ENABLED</code> off). Totals
          reflect stored FunnelEvent rows only — usually empty until tracking is
          enabled in a controlled environment.
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400 space-y-1">
        <p>
          <span className="font-medium text-slate-300">A. Event-period activity</span>{" "}
          — stage bars count events whose <code>occurredAt</code> falls in the
          selected America/Toronto range.
        </p>
        <p>
          <span className="font-medium text-slate-300">B. Registration-cohort outcomes</span>{" "}
          — KPI cards and completed→continued / completed→engaged rates follow
          users who registered in-range and later continued (45m) or engaged
          (7d).
        </p>
        <p>
          <span className="font-medium text-slate-300">C. Same-period linked conversions</span>{" "}
          — search→listing and gate→registration require both events in the
          selected period (cross-midnight journeys may be excluded).
        </p>
      </div>

      <PlatformStatGrid>
        <PlatformStatCard
          label="Registered users (cohort)"
          value={report.kpis.registeredUsers}
          hint="B · Distinct userId · registration_completed in selected period"
        />
        <PlatformStatCard
          label="Continued users (cohort)"
          value={report.kpis.continuedUsers}
          hint="B · Subset of registered who continued within 45 minutes"
        />
        <PlatformStatCard
          label="Engaged users (cohort)"
          value={report.kpis.engagedUsers}
          hint="B · Subset of registered who engaged within 7 days (distinct across types)"
        />
        <PlatformStatCard
          label="Engagement rate (cohort)"
          value={formatConversionPercent(report.kpis.engagementRate)}
          hint={report.kpis.engagementRateLabel}
        />
      </PlatformStatGrid>

      {!hasAnyEvents ? (
        <PlatformEmptyState message="No funnel events in the selected range. Enable tracking and generate traffic, or widen the date filter." />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <PlatformPanel title="Funnel stages (A · event-period)">
          <p className="mb-3 text-xs text-slate-500">
            Observation counts only — not a forced sequential journey. Units are
            distinct sessions, visitors, or users as labeled.
          </p>
          <FunnelStageBars stages={report.stages} />
        </PlatformPanel>

        <PlatformPanel title="Conversion rates (B · cohort / C · same-period)">
          <ul className="space-y-3">
            {report.conversions.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-100">
                      {c.label}
                    </p>
                    {c.rateKind === "observed_matched" ? (
                      <p className="mt-1 text-xs font-medium text-amber-300/90">
                        Observed matched rate — not a definitive conversion rate
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">{c.cohortNote}</p>
                    {c.identityCoverageNote ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {c.identityCoverageNote}
                      </p>
                    ) : null}
                    {c.status === "insufficient_data" && c.reason ? (
                      <p className="mt-1 text-xs text-amber-400/90">{c.reason}</p>
                    ) : null}
                    {c.status === "available" && c.reason ? (
                      <p className="mt-1 text-xs text-amber-400/90">{c.reason}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    {c.status === "insufficient_data" ? (
                      <>
                        <p className="text-lg font-semibold text-slate-400">
                          Insufficient data
                        </p>
                        <p className="text-xs text-slate-500">—</p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-semibold text-white">
                          {formatConversionPercent(c.rate)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {c.numerator} / {c.denominator}
                          {c.rateKind === "observed_matched"
                            ? " matched"
                            : ""}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </PlatformPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PlatformPanel title="Engagement by type (A · event-period)">
          <p className="mb-3 text-xs text-slate-500">
            Distinct users per engagement type among events in the selected
            period. Types may overlap. Overall engaged KPI (above) is the
            registration-cohort distinct count — each user once.
          </p>
          <ul className="space-y-2 text-sm">
            {report.engagementByType.map((row) => (
              <li
                key={row.type}
                className="flex items-center justify-between border-b border-slate-800/80 pb-2 last:border-0"
              >
                <span className="text-slate-300">
                  {ENGAGEMENT_LABELS[row.type] ?? row.type}
                </span>
                <span className="font-medium text-white">
                  {row.distinctUsers}
                </span>
              </li>
            ))}
          </ul>
        </PlatformPanel>

        <PlatformPanel title="Acquisition of registered converters">
          <p className="mb-3 text-xs text-slate-500">
            Based on Lead UTM / click-ID for users with registration_completed in
            range. Anonymous visitor activity is not attributable.
          </p>
          {report.acquisitionOfConverters.every((a) => a.count === 0) ? (
            <p className="text-sm text-slate-400">
              No converter attribution in range — surfaces as unknown until UTM
              or click IDs are present.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.acquisitionOfConverters.map((row) => (
                <li
                  key={row.channel}
                  className="flex items-center justify-between border-b border-slate-800/80 pb-2 last:border-0"
                >
                  <span className="text-slate-300">
                    {CHANNEL_LABELS[row.channel] ?? row.channel}
                  </span>
                  <span className="font-medium text-white">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </PlatformPanel>
      </div>

      <PlatformPanel title="Funnel counting notes">
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
          {report.meta.classificationNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </PlatformPanel>
    </div>
  );
}

function FunnelStageBars({
  stages,
}: {
  stages: FunnelAnalyticsReport["stages"];
}) {
  const availableCounts = stages
    .filter((s) => s.status === "available" && s.primaryCount != null)
    .map((s) => s.primaryCount as number);
  const max = Math.max(1, ...availableCounts);

  return (
    <ol className="space-y-3">
      {stages.map((stage, index) => {
        if (stage.status === "unavailable") {
          return (
            <li
              key={stage.id}
              className="rounded-lg border border-dashed border-slate-700 px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    {index + 1}. {stage.label}
                  </p>
                  <p className="mt-1 text-xs text-amber-400/90">
                    Unavailable — {stage.unavailableReason}
                  </p>
                </div>
                <span className="text-sm font-medium text-slate-500">N/A</span>
              </div>
            </li>
          );
        }

        const count = stage.primaryCount ?? 0;
        const widthPct = Math.max(4, Math.round((count / max) * 100));

        return (
          <li key={stage.id}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-200">
                {index + 1}. {stage.label}
              </span>
              <span className="font-medium text-white">
                {count.toLocaleString("en-CA")}{" "}
                <span className="text-xs font-normal text-slate-500">
                  {stage.primaryUnit}
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-600/80"
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Events {stage.eventCount.toLocaleString("en-CA")} · visitors{" "}
              {stage.distinctVisitors.toLocaleString("en-CA")} · sessions{" "}
              {stage.distinctSessions.toLocaleString("en-CA")} · users{" "}
              {stage.distinctUsers.toLocaleString("en-CA")}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
