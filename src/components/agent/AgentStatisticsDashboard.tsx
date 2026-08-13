"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Clock3,
  Flame,
  Mail,
  Search,
  Target,
  TrendingUp,
  Users,
  Eye,
} from "lucide-react";
import Link from "next/link";
import type { AgentStatistics } from "@/lib/agent/statistics-shared";
import { formatResponseMins } from "@/lib/agent/statistics-shared";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS = [7, 30, 90] as const;

const BLUE = "#2b6cb0";
const BLUE_SOFT = "#7dd3fc";
const AMBER = "#f59e0b";
const TEAL = "#0d9488";
const ROSE = "#e11d48";
const SLATE = "#64748b";
const GRID = "#e2e8f0";

const PIE_COLORS = [
  BLUE,
  TEAL,
  AMBER,
  "#8b5cf6",
  ROSE,
  "#0ea5e9",
  "#84cc16",
  SLATE,
];

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[#d8dee6] bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CardHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="border-b border-[#e8edf2] px-4 py-3 sm:px-5">
      <h2 className="text-[15px] font-semibold text-[#1e2a38] sm:text-[16px]">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-0.5 text-[12px] text-[#64748b] sm:text-[13px]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "danger" | "ok" | "warn";
}) {
  const toneClass =
    tone === "danger"
      ? "border-[#fecdd3] bg-[#fff1f2]"
      : tone === "ok"
        ? "border-[#bbf7d0] bg-[#f0fdf4]"
        : tone === "warn"
          ? "border-[#fde68a] bg-[#fffbeb]"
          : "border-[#d8dee6] bg-white";
  const iconClass =
    tone === "danger"
      ? "text-[#e11d48]"
      : tone === "ok"
        ? "text-canopy"
        : tone === "warn"
          ? "text-[#d97706]"
          : "text-[#2b6cb0]";

  return (
    <div className={cn("rounded-xl border p-3.5 sm:p-4", toneClass)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748b]">
          {label}
        </p>
        <Icon className={cn("size-4 shrink-0", iconClass)} />
      </div>
      <p className="mt-2 text-[26px] font-bold leading-none tabular-nums text-[#1e2a38] sm:text-[30px]">
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 text-[12px] font-medium text-[#64748b]">{hint}</p>
      ) : null}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#d8dee6] bg-white px-3 py-2 text-[12px] shadow-lg">
      {label ? (
        <p className="mb-1 font-semibold text-[#1e2a38]">{label}</p>
      ) : null}
      {payload.map((p) => (
        <p key={String(p.name)} className="text-[#475569]">
          <span
            className="mr-1.5 inline-block size-2 rounded-full"
            style={{ background: p.color ?? BLUE }}
          />
          {p.name}:{" "}
          <span className="font-semibold tabular-nums text-[#1e2a38]">
            {p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export function AgentStatisticsDashboard({ data }: { data: AgentStatistics }) {
  const { kpis } = data;
  const maxPipeline = Math.max(...data.pipeline.map((p) => p.count), 1);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#1e2a38] sm:text-[28px]">
            Statistics
          </h1>
          <p className="mt-1 text-[13px] text-[#64748b] sm:text-[14px]">
            Performance for{" "}
            <span className="font-semibold text-[#2b6cb0]">{data.scopeLabel}</span>
            {" · "}
            last {data.rangeDays} days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden text-[12px] font-medium text-[#94a3b8] sm:block">
            Lead gen · SLA · engagement
          </p>
          <div
            className="inline-flex rounded-lg border border-[#d8dee6] bg-[#f8fafc] p-0.5"
            role="group"
            aria-label="Date range"
          >
            {RANGE_OPTIONS.map((days) => {
              const active = data.rangeDays === days;
              return (
                <Link
                  key={days}
                  href={`/agent/statistics?range=${days}`}
                  scroll={false}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-md px-3 py-2 text-[12px] font-semibold tabular-nums transition sm:px-3",
                    active
                      ? "bg-white text-[#2b6cb0] shadow-sm"
                      : "text-[#64748b] hover:text-[#1e2a38]",
                  )}
                >
                  {days}d
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 xl:grid-cols-4">
        <Kpi
          label="Leads (period)"
          value={kpis.leadsPeriod}
          hint={`${kpis.leadsToday} today · ${kpis.leadsTotal} all-time`}
          icon={Users}
        />
        <Kpi
          label="Response rate"
          value={`${kpis.responseRate}%`}
          hint={`${kpis.newWaiting} still new`}
          icon={Target}
          tone={kpis.responseRate >= 70 ? "ok" : kpis.responseRate >= 40 ? "warn" : "danger"}
        />
        <Kpi
          label="Avg response time"
          value={formatResponseMins(kpis.avgResponseMins)}
          hint={`New → Attempted · median ${formatResponseMins(kpis.medianResponseMins)}`}
          icon={Clock3}
          tone={
            kpis.avgResponseMins != null && kpis.avgResponseMins <= 60
              ? "ok"
              : "warn"
          }
        />
        <Kpi
          label="Hot now"
          value={kpis.hotLeads}
          hint="High-intent working leads"
          icon={Flame}
          tone={kpis.hotLeads > 0 ? "danger" : "default"}
        />
        <Kpi
          label="Listing views"
          value={kpis.listingViewsPeriod}
          hint="Customer journey views"
          icon={Eye}
        />
        <Kpi
          label="Searches"
          value={kpis.searchesPeriod}
          hint="Buyer search activity"
          icon={Search}
        />
        <Kpi
          label="Emails sent"
          value={kpis.emailsPeriod}
          hint={`${kpis.tasksCompletedPeriod} tasks done`}
          icon={Mail}
        />
        <Kpi
          label="Appointments"
          value={kpis.appointmentsPeriod}
          hint={`${kpis.savesPeriod} homes saved`}
          icon={TrendingUp}
          tone="ok"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Lead intake & attempted contact"
            subtitle="New leads vs agent first-touch volume by day"
          />
          <div className="h-[240px] px-2 py-3 sm:h-[280px] sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.leadsByDay} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BLUE} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="respFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TEAL} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: SLATE, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: SLATE, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="leads"
                  name="New leads"
                  stroke={BLUE}
                  fill="url(#leadFill)"
                  strokeWidth={2.2}
                  activeDot={{ r: 4 }}
                />
                <Area
                  type="monotone"
                  dataKey="responses"
                  name="Attempted contact"
                  stroke={TEAL}
                  fill="url(#respFill)"
                  strokeWidth={2}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Conversion funnel"
            subtitle="Where the pipeline concentrates"
          />
          <div className="space-y-3 px-4 py-4 sm:px-5">
            {data.funnel.map((row) => (
              <div key={row.stage}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-medium text-[#334155]">{row.stage}</span>
                  <span className="font-bold tabular-nums text-[#1e2a38]">
                    {row.count}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#eef2f6]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#2b6cb0] to-[#38bdf8] transition-[width]"
                    style={{ width: `${Math.max(row.pct, row.count > 0 ? 6 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Pipeline mix"
            subtitle="Current status distribution"
          />
          <div className="space-y-2 px-4 py-4 sm:px-5">
            {data.pipeline.map((row) => (
              <div key={row.status} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[12px] font-medium text-[#64748b] sm:w-28 sm:text-[13px]">
                  {row.label}
                </span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#eef2f6]">
                  <div
                    className="h-full rounded-full bg-[#2b6cb0]"
                    style={{
                      width: `${Math.max(
                        (row.count / maxPipeline) * 100,
                        row.count > 0 ? 4 : 0,
                      )}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-[13px] font-bold tabular-nums text-[#1e2a38]">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Response time distribution"
            subtitle="How fast New Lead → Attempted Contact"
          />
          <div className="h-[220px] px-2 py-3 sm:h-[240px] sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.responseBuckets} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: SLATE, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: SLATE, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Leads" radius={[6, 6, 0, 0]} fill={AMBER} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Lead sources" subtitle={`Last ${data.rangeDays} days`} />
          <div className="h-[220px] px-2 py-2">
            {data.sources.length === 0 ? (
              <p className="flex h-full items-center justify-center text-[13px] text-[#94a3b8]">
                No leads in this period.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.sources}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {data.sources.map((entry, i) => (
                      <Cell
                        key={entry.source}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <ul className="max-h-36 space-y-1.5 overflow-y-auto border-t border-[#e8edf2] px-4 py-3">
            {data.sources.map((s, i) => (
              <li
                key={s.source}
                className="flex items-center justify-between gap-2 text-[12px]"
              >
                <span className="flex min-w-0 items-center gap-2 truncate text-[#475569]">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="truncate capitalize">{s.label.toLowerCase()}</span>
                </span>
                <span className="font-bold tabular-nums text-[#1e2a38]">
                  {s.count}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Buyer vs seller" subtitle="Desk intent mix" />
          <div className="h-[220px] px-2 py-2">
            {data.intentMix.length === 0 ? (
              <p className="flex h-full items-center justify-center text-[13px] text-[#94a3b8]">
                No intent data yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.intentMix}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={3}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {data.intentMix.map((entry, i) => (
                      <Cell
                        key={entry.intent}
                        fill={i === 0 ? BLUE : AMBER}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <ul className="space-y-1.5 border-t border-[#e8edf2] px-4 py-3">
            {data.intentMix.map((s, i) => (
              <li
                key={s.intent}
                className="flex items-center justify-between gap-2 text-[12px]"
              >
                <span className="flex items-center gap-2 text-[#475569]">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: i === 0 ? BLUE : AMBER }}
                  />
                  {s.label}
                </span>
                <span className="font-bold tabular-nums text-[#1e2a38]">
                  {s.count}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Inquiry tags"
            subtitle="How agents classify requests"
          />
          <div className="h-[220px] px-2 py-3 sm:px-3">
            {data.inquiryTags.length === 0 ? (
              <p className="flex h-full items-center justify-center text-[13px] text-[#94a3b8]">
                Tag contact requests to populate this.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.inquiryTags}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={88}
                    tick={{ fill: SLATE, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Tagged" radius={[0, 6, 6, 0]} fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Customer journey activity"
          subtitle="What your leads are doing on Houzzat"
        />
        <div className="h-[220px] px-2 py-3 sm:h-[250px] sm:px-4">
          {data.activityByType.length === 0 ? (
            <p className="flex h-full items-center justify-center text-[13px] text-[#94a3b8]">
              No linked customer activity in this range yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.activityByType}
                margin={{ top: 8, right: 8, left: -12, bottom: 40 }}
              >
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: SLATE, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: SLATE, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Events" radius={[6, 6, 0, 0]} fill={BLUE_SOFT} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}
