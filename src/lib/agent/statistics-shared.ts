/** Client-safe types + formatters for agent statistics (no Prisma). */

export type AgentStatistics = {
  scopeLabel: string;
  rangeDays: number;
  kpis: {
    leadsTotal: number;
    leadsPeriod: number;
    leadsToday: number;
    newWaiting: number;
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
  funnel: Array<{ stage: string; count: number; pct: number }>;
  responseBuckets: Array<{ label: string; count: number }>;
};

export function formatResponseMins(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
