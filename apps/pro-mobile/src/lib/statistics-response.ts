/**
 * Stage 5.9 — Native Statistics response helpers.
 * DTO matches web AgentStatistics (src/lib/agent/statistics-shared.ts).
 */

export type MobileAgentStatistics = {
  scopeLabel: string;
  rangeDays: number;
  kpis: {
    leadsTotal: number;
    leadsPeriod: number;
    leadsToday: number;
    newWaiting: number;
    /** Web label "Response rate" = % of desk leads not NEW_LEAD (all-time). */
    responseRate: number;
    avgResponseMins: number | null;
    medianResponseMins: number | null;
    listingViewsPeriod: number;
    searchesPeriod: number;
    emailsPeriod: number;
    tasksCompletedPeriod: number;
    appointmentsPeriod: number;
    hotLeads: number;
    savesPeriod: number;
  };
  leadsByDay: Array<{
    date: string;
    label: string;
    leads: number;
    responses: number;
  }>;
  pipeline: Array<{ status: string; label: string; count: number }>;
  sources: Array<{ source: string; label: string; count: number }>;
  inquiryTags: Array<{ tag: string; label: string; count: number }>;
  intentMix: Array<{ intent: string; label: string; count: number }>;
  activityByType: Array<{ type: string; label: string; count: number }>;
  /** Concentration bars — NOT stage conversion rates. */
  funnel: Array<{ stage: string; count: number; pct: number }>;
  responseBuckets: Array<{ label: string; count: number }>;
};

export function emptyAgentStatistics(
  rangeDays: number,
  scopeLabel: string,
): MobileAgentStatistics {
  return {
    scopeLabel,
    rangeDays,
    kpis: {
      leadsTotal: 0,
      leadsPeriod: 0,
      leadsToday: 0,
      newWaiting: 0,
      responseRate: 0,
      avgResponseMins: null,
      medianResponseMins: null,
      listingViewsPeriod: 0,
      searchesPeriod: 0,
      emailsPeriod: 0,
      tasksCompletedPeriod: 0,
      appointmentsPeriod: 0,
      hotLeads: 0,
      savesPeriod: 0,
    },
    leadsByDay: [],
    pipeline: [],
    sources: [],
    inquiryTags: [],
    intentMix: [],
    activityByType: [],
    funnel: [],
    responseBuckets: [
      { label: "< 15m", count: 0 },
      { label: "15–60m", count: 0 },
      { label: "1–4h", count: 0 },
      { label: "4–24h", count: 0 },
      { label: "> 24h", count: 0 },
    ],
  };
}

export function unwrapStatistics(payload: unknown): MobileAgentStatistics | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  if (data.statistics && typeof data.statistics === "object") {
    return data.statistics as MobileAgentStatistics;
  }
  if ("kpis" in data && "pipeline" in data) {
    return data as unknown as MobileAgentStatistics;
  }
  return null;
}

export function formatResponseMins(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
