import Link from "next/link";
import { FunnelAnalyticsSection } from "@/components/platform/FunnelAnalyticsSection";
import {
  PlatformEmptyState,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPanel,
  PlatformStatCard,
  PlatformStatGrid,
  PlatformTableWrap,
} from "@/components/platform/PlatformUi";
import type { FunnelAnalyticsReport } from "@/lib/platform/funnel-analytics";
import type { SignupAnalyticsReport } from "@/lib/platform/signup-analytics";

const CHANNEL_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  organic: "Organic",
  direct: "Direct",
  referral: "Referral",
  social: "Social",
  unknown: "Unknown",
};

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
] as const;

export type SignupAnalyticsFilters = {
  workspaceId?: string;
  preset?: string;
  from?: string;
  to?: string;
};

type SignupAnalyticsDashboardProps = {
  report: SignupAnalyticsReport | null;
  errorMessage: string | null;
  filters: SignupAnalyticsFilters;
  funnelReport?: FunnelAnalyticsReport | null;
  funnelErrorMessage?: string | null;
};

export function SignupAnalyticsDashboard({
  report,
  errorMessage,
  filters,
  funnelReport = null,
  funnelErrorMessage = null,
}: SignupAnalyticsDashboardProps) {
  const preset = filters.preset ?? report?.meta.preset ?? "30d";
  const workspaceId = filters.workspaceId ?? "";

  return (
    <>
      <PlatformPageHeader
        title="Signup Analytics"
        description="Consumer registration counts and visitor-to-engagement conversion funnel across HouzzatPRO tenants. Aggregates only — no CRM records or personal data."
      />

      <form
        method="get"
        action="/platform/signup-analytics"
        className="mb-6 grid gap-3 rounded-xl border border-slate-800 bg-[#111827] p-4 md:grid-cols-2 xl:grid-cols-6"
      >
        <label className="flex flex-col gap-1 text-xs text-slate-400 xl:col-span-2">
          Tenant
          <select
            name="workspaceId"
            defaultValue={workspaceId}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            <option value="">All tenants</option>
            {(report?.workspaces ?? []).map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
                {ws.slug ? ` (${ws.slug})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Range
          <select
            name="preset"
            defaultValue={preset}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          To
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Apply
          </button>
          <Link
            href="/platform/signup-analytics"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Reset
          </Link>
        </div>
      </form>

      {errorMessage ? (
        <PlatformErrorState
          title="Signup analytics unavailable"
          message={errorMessage}
        />
      ) : !report ? (
        <PlatformEmptyState message="Loading signup analytics…" />
      ) : report.totals.allTime === 0 && report.totals.inRange === 0 ? (
        <PlatformEmptyState message="No consumer signups found for the selected filters." />
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-slate-500">
            Calendar buckets use {report.meta.timeZoneLabel} (
            {report.meta.timeZone}). Generated{" "}
            {new Date(report.meta.generatedAt).toLocaleString("en-CA", {
              timeZone: report.meta.timeZone,
            })}
            .
          </p>

          <PlatformStatGrid>
            <PlatformStatCard
              label="In selected range"
              value={report.totals.inRange}
              hint={rangeHint(report)}
            />
            <PlatformStatCard
              label="All-time signups"
              value={report.totals.allTime}
              hint={
                report.meta.workspaceId
                  ? "Selected tenant"
                  : "All tenants"
              }
            />
            <PlatformStatCard
              label="Today"
              value={report.totals.currentPeriod.today}
              hint="Current period KPI — not tied to selected range"
            />
            <PlatformStatCard
              label="Last 7 / 30 days"
              value={`${report.totals.currentPeriod.last7Days} / ${report.totals.currentPeriod.last30Days}`}
              hint="Current period KPIs — independent of selected range"
            />
          </PlatformStatGrid>
          <p className="text-xs text-slate-500">
            Today, Last 7 Days, and Last 30 Days are always current-period KPIs
            (as of report generation in {report.meta.timeZoneLabel}). They do
            not follow a custom or historical selected range. Trend, tenant
            table, verification, and acquisition use the selected range.
          </p>

          <div className="grid gap-6 xl:grid-cols-2">
            <PlatformPanel title="Signup trend">
              <SignupTrendChart trend={report.trend} />
            </PlatformPanel>

            <PlatformPanel title="Email & phone verification">
              <VerificationBars verification={report.verification} />
            </PlatformPanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <PlatformPanel title="Acquisition channels">
              {report.acquisition.every((a) => a.count === 0) ? (
                <p className="text-sm text-slate-400">
                  No acquisition signals in range — all unknown until UTM or
                  click IDs are present.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {report.acquisition.map((row) => (
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
              <p className="mt-3 text-xs text-slate-500">
                Channels use stored UTM / click-ID data only. Lead source SIGNUP
                is not treated as Google Ads.
              </p>
            </PlatformPanel>

            <PlatformPanel title="Attribution dimensions">
              <AttributionDimensions report={report} />
            </PlatformPanel>
          </div>

          {report.tenantDetail ? (
            <PlatformPanel title="Tenant signup details">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <DetailStat
                  label="Workspace"
                  value={report.tenantDetail.workspaceName}
                  hint={report.tenantDetail.workspaceSlug ?? undefined}
                />
                <DetailStat
                  label="In range"
                  value={String(report.tenantDetail.inRange)}
                />
                <DetailStat
                  label="All-time"
                  value={String(report.tenantDetail.allTime)}
                />
                <DetailStat
                  label="Email / phone OTP verified"
                  value={`${report.tenantDetail.emailVerified} / ${report.tenantDetail.phoneOtpVerified}`}
                  hint={`Agent-confirmed phone: ${report.tenantDetail.phoneAgentConfirmed}`}
                />
              </div>
            </PlatformPanel>
          ) : (
            <PlatformPanel title="Signups by tenant">
              {report.byTenant.length === 0 ? (
                <PlatformEmptyState message="No tenant signups in the selected range." />
              ) : (
                <PlatformTableWrap>
                  <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3">Slug</th>
                      <th className="px-4 py-3 text-right">Signups</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-[#111827]">
                    {report.byTenant.map((row) => (
                      <tr key={row.workspaceId} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-medium text-white">
                          {row.workspaceName}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {row.workspaceSlug ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-200">
                          {row.count}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/platform/signup-analytics?workspaceId=${encodeURIComponent(row.workspaceId)}&preset=${encodeURIComponent(preset)}`}
                            className="text-sm text-emerald-400 hover:text-emerald-300"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </PlatformTableWrap>
              )}
            </PlatformPanel>
          )}

          <PlatformPanel title="Counting notes">
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
              {report.meta.classificationNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </PlatformPanel>
        </div>
      )}

      <FunnelAnalyticsSection
        report={funnelReport}
        errorMessage={funnelErrorMessage}
      />
    </>
  );
}

function rangeHint(report: SignupAnalyticsReport): string {
  if (report.meta.preset === "all") return "All time";
  if (report.meta.preset === "custom") return "Custom range";
  return report.meta.preset;
}

function DetailStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-white">{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function SignupTrendChart({
  trend,
}: {
  trend: SignupAnalyticsReport["trend"];
}) {
  if (trend.length === 0) {
    return (
      <p className="text-sm text-slate-400">No trend points for this range.</p>
    );
  }
  const max = Math.max(1, ...trend.map((d) => d.count));
  const width = Math.max(320, trend.length * 18);
  const height = 160;
  const pad = 16;
  const barGap = 2;
  const barW = Math.max(2, (width - pad * 2) / trend.length - barGap);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full min-w-[280px] text-emerald-400"
        role="img"
        aria-label="Signup trend chart"
      >
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {trend.map((point, i) => {
          const h =
            point.count === 0
              ? 0
              : ((height - pad * 2) * point.count) / max;
          const x = pad + i * (barW + barGap);
          const y = height - pad - h;
          return (
            <rect
              key={point.date}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={1}
              fill="currentColor"
              opacity={0.85}
            >
              <title>
                {point.date}: {point.count}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{trend[0]?.date}</span>
        <span>{trend[trend.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function VerificationBars({
  verification,
}: {
  verification: SignupAnalyticsReport["verification"];
}) {
  const emailTotal =
    verification.emailVerified + verification.emailUnverified;
  const phoneOtpTotal =
    verification.phoneOtpVerified + verification.phoneOtpUnverified;

  return (
    <div className="space-y-5 text-sm">
      <VerifyRow
        label="Email verified"
        verified={verification.emailVerified}
        unverified={verification.emailUnverified}
        total={emailTotal}
      />
      <VerifyRow
        label="Phone OTP verified"
        verified={verification.phoneOtpVerified}
        unverified={verification.phoneOtpUnverified}
        total={phoneOtpTotal}
      />
      <div>
        <div className="mb-1 flex justify-between text-slate-300">
          <span>Agent-confirmed phone</span>
          <span>{verification.phoneAgentConfirmed}</span>
        </div>
        <p className="text-xs text-slate-500">
          CRM agent confirmation — not consumer OTP verification.
        </p>
      </div>
    </div>
  );
}

function VerifyRow({
  label,
  verified,
  unverified,
  total,
}: {
  label: string;
  verified: number;
  unverified: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((verified / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-slate-300">
        <span>{label}</span>
        <span>
          {verified} / {total} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">{unverified} unverified</p>
    </div>
  );
}

function AttributionDimensions({
  report,
}: {
  report: SignupAnalyticsReport;
}) {
  const dims = report.attributionDimensions;
  const hasAny =
    dims.utmSources.length > 0 ||
    dims.utmMediums.length > 0 ||
    dims.utmCampaigns.length > 0 ||
    dims.clickIds.withAnyClickId > 0;

  if (!hasAny) {
    return (
      <p className="text-sm text-slate-400">
        Unknown — no stored UTM source, medium, campaign, or click-ID values for
        signups in this range.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4">
        <ClickStat label="gclid" value={dims.clickIds.withGclid} />
        <ClickStat label="gbraid" value={dims.clickIds.withGbraid} />
        <ClickStat label="wbraid" value={dims.clickIds.withWbraid} />
        <ClickStat label="Any click ID" value={dims.clickIds.withAnyClickId} />
      </div>
      <DimList title="UTM source" rows={dims.utmSources} />
      <DimList title="UTM medium" rows={dims.utmMediums} />
      <DimList title="UTM campaign" rows={dims.utmCampaigns} />
    </div>
  );
}

function ClickStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 px-3 py-2">
      <p className="uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-medium text-white">{value}</p>
    </div>
  );
}

function DimList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ value: string; count: number }>;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
          {title}
        </p>
        <p className="text-xs text-slate-500">None recorded</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <ul className="max-h-36 space-y-1 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.value} className="flex justify-between text-slate-300">
            <span className="truncate pr-3">{row.value}</span>
            <span>{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
