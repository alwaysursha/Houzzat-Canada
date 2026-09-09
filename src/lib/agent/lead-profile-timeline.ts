import {
  ALL_ACTIVITY_FILTER_IDS,
  isDefaultActivityFilters,
  timelineItemMatchesFilters,
  type TimelineScope,
} from "@/lib/agent/activity-filters";
import { isPropertyAlertEmailKind } from "@/lib/agent/email-alert-kinds";
import {
  LEAD_PROFILE_EMAIL_LIST_SELECT,
  TIMELINE_ACTIVITY_EVENT_SELECT,
  dedupeNearDuplicateListingViews,
  enrichWithListingCovers,
  labelActivity,
  serializeTimelineItem,
  type TimelineItem,
  type TimelineItemDto,
} from "@/lib/agent/customer-timeline";
import {
  isPropertyAlertUtmCampaign,
  pathLooksLikePropertyAlert,
} from "@/lib/email/property-alert-links";
import { mlsNumberFromListingPath } from "@/lib/listings/listing-path";
import { prisma } from "@/lib/prisma";

export const FIRST_PAINT_TIMELINE_DAYS = 4;
export const TIMELINE_PAGE_SIZE = 40;

type TimelineSource =
  | "leadActs"
  | "notes"
  | "emails"
  | "tasks"
  | "appointments"
  | "events"
  | "views"
  | "saves"
  | "searches"
  | "monitors"
  | "areaMonitors"
  | "alerts";

const FILTER_SOURCES: Record<string, TimelineSource[]> = {
  ai: ["leadActs", "events"],
  autotracks: ["events"],
  behavioral: ["events", "leadActs"],
  calls: ["notes"],
  direct_mailers: ["leadActs"],
  emails: ["emails", "leadActs"],
  property_alerts: ["emails", "events", "monitors", "areaMonitors", "alerts"],
  text: ["events", "leadActs"],
  favorites: ["saves", "events"],
  inquiries: ["leadActs"],
  logins: ["events"],
  property_views: ["events", "views"],
  registration: ["leadActs"],
  searches: ["events", "searches"],
  unsubscribes: ["leadActs"],
  appointments: ["appointments"],
  assigned_agent: ["leadActs"],
  label: ["leadActs"],
  notes: ["notes"],
  pipeline: ["leadActs"],
  reminders: ["tasks"],
  saved_search: ["searches"],
  status_history: ["leadActs"],
  lead_info: ["leadActs"],
};

const ALL_SOURCES: TimelineSource[] = [
  "leadActs",
  "notes",
  "emails",
  "tasks",
  "appointments",
  "events",
  "views",
  "saves",
  "searches",
  "monitors",
  "areaMonitors",
  "alerts",
];

export type LeadTimelinePage = {
  items: TimelineItemDto[];
  hasMore: boolean;
  scope: TimelineScope;
};

function createdAtFilter(since: Date | null, before: Date | null) {
  if (!since && !before) return undefined;
  return {
    ...(since ? { gte: since } : {}),
    ...(before ? { lt: before } : {}),
  };
}

function sourcesForFilters(filterIds: Set<string> | null): Set<TimelineSource> {
  if (!filterIds || filterIds.size === ALL_ACTIVITY_FILTER_IDS.length) {
    return new Set(ALL_SOURCES);
  }
  const sources = new Set<TimelineSource>();
  for (const id of filterIds) {
    for (const source of FILTER_SOURCES[id] ?? []) {
      sources.add(source);
    }
  }
  return sources.size > 0 ? sources : new Set(ALL_SOURCES);
}

function want(sources: Set<TimelineSource>, source: TimelineSource) {
  return sources.has(source);
}

export async function loadPagedLeadTimeline(input: {
  leadId: string;
  customerId: string | null;
  scope: TimelineScope;
  take?: number;
  before?: Date | null;
  filterIds?: string[] | null;
}): Promise<LeadTimelinePage> {
  const take = Math.min(Math.max(input.take ?? TIMELINE_PAGE_SIZE, 1), 40);
  const since =
    input.scope === "recent"
      ? new Date(Date.now() - FIRST_PAINT_TIMELINE_DAYS * 24 * 60 * 60 * 1000)
      : null;
  const before = input.before ?? null;
  const createdAt = createdAtFilter(since, before);
  const filterSet =
    input.filterIds && input.filterIds.length > 0
      ? new Set(input.filterIds)
      : null;
  const restrictFilters =
    filterSet &&
    !isDefaultActivityFilters(filterSet) &&
    filterSet.size !== ALL_ACTIVITY_FILTER_IDS.length
      ? filterSet
      : null;
  const sources = sourcesForFilters(restrictFilters);
  const perSource = take;

  const items: TimelineItem[] = [];

  const [leadActs, notes, emails, tasks, appointments] = await Promise.all([
    want(sources, "leadActs")
      ? prisma.leadActivity.findMany({
          where: { leadId: input.leadId, ...(createdAt ? { createdAt } : {}) },
          orderBy: { createdAt: "desc" },
          take: perSource,
          select: { id: true, type: true, body: true, createdAt: true },
        })
      : Promise.resolve([]),
    want(sources, "notes")
      ? prisma.leadNote.findMany({
          where: { leadId: input.leadId, ...(createdAt ? { createdAt } : {}) },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
          take: perSource,
          select: {
            id: true,
            body: true,
            category: true,
            pinned: true,
            pinnedAt: true,
            createdAt: true,
            author: { select: { name: true, email: true } },
          },
        })
      : Promise.resolve([]),
    want(sources, "emails")
      ? prisma.leadEmailLog.findMany({
          where: { leadId: input.leadId, ...(createdAt ? { createdAt } : {}) },
          orderBy: { createdAt: "desc" },
          take: perSource,
          select: LEAD_PROFILE_EMAIL_LIST_SELECT,
        })
      : Promise.resolve([]),
    want(sources, "tasks")
      ? prisma.agentTask.findMany({
          where: { leadId: input.leadId, ...(createdAt ? { createdAt } : {}) },
          orderBy: { createdAt: "desc" },
          take: perSource,
          select: {
            id: true,
            type: true,
            status: true,
            title: true,
            body: true,
            createdAt: true,
            completedAt: true,
          },
        })
      : Promise.resolve([]),
    want(sources, "appointments")
      ? prisma.appointment.findMany({
          where: { leadId: input.leadId, ...(createdAt ? { createdAt } : {}) },
          orderBy: { createdAt: "desc" },
          take: perSource,
          select: {
            id: true,
            type: true,
            status: true,
            startsAt: true,
            listingMls: true,
            notes: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  for (const a of leadActs) {
    if (a.type === "note" || a.type === "email_sent") continue;
    const engagementType =
      a.type === "email_opened"
        ? "EMAIL_OPENED"
        : a.type === "email_clicked"
          ? "EMAIL_CLICKED"
          : a.type;
    items.push({
      id: `la-${a.id}`,
      source: "lead",
      type: engagementType,
      title:
        a.type === "email_opened"
          ? "Email opened"
          : a.type === "email_clicked"
            ? "Email link clicked"
            : labelActivity(a.type),
      body: a.body,
      mlsNumber: null,
      path: null,
      imageUrl: null,
      createdAt: a.createdAt,
    });
  }
  for (const n of notes) {
    const kind = n.category === "CALL" ? "Call" : "General";
    items.push({
      id: `note-${n.id}`,
      source: "note",
      type: n.category === "CALL" ? "CALL_NOTE" : "NOTE",
      title: `${kind} note · ${n.author.name || n.author.email}`,
      body: n.body,
      mlsNumber: null,
      path: null,
      imageUrl: null,
      createdAt: n.createdAt,
      noteId: n.id,
      noteCategory: n.category,
      pinned: n.pinned,
      pinnedAt: n.pinnedAt,
    });
  }
  for (const e of emails) {
    const kind = e.kind ?? "custom";
    const isAlert = isPropertyAlertEmailKind(kind);
    const isDigest =
      kind === "saved_search_digest" || kind === "neighborhood_weekly";
    items.push({
      id: `email-${e.id}`,
      source: "email",
      type: isDigest
        ? "DIGEST_EMAIL"
        : isAlert
          ? "PROPERTY_ALERT_EMAIL"
          : kind === "shortlist"
            ? "SHORTLIST_EMAILED"
            : kind === "agent_message"
              ? "AGENT_MESSAGE"
              : "EMAIL",
      title: e.subject,
      body: null,
      mlsNumber: e.mlsNumber ?? null,
      path: null,
      imageUrl: null,
      createdAt: e.createdAt,
      emailPreviewPath: `/agent/emails/${e.id}`,
      emailKind: kind,
      emailOpenedAt: e.openedAt,
      emailClickedAt: e.clickedAt,
      emailOpenCount: e.openCount,
      emailClickCount: e.clickCount,
      lastClickedUrl: e.lastClickedUrl,
    });
  }
  for (const t of tasks) {
    items.push({
      id: `task-${t.id}`,
      source: "task",
      type: t.type,
      title: `${t.status === "DONE" ? "Done" : "Task"} · ${t.title}`,
      body: t.body,
      mlsNumber: null,
      path: null,
      imageUrl: null,
      createdAt: t.completedAt ?? t.createdAt,
    });
  }
  for (const a of appointments) {
    const when = a.startsAt
      ? a.startsAt.toLocaleString("en-CA", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unscheduled";
    items.push({
      id: `appt-${a.id}`,
      source: "domain",
      type: "APPOINTMENT",
      title: `${a.type.replaceAll("_", " ")} · ${a.status}`,
      body: `${when}${a.listingMls ? ` · MLS ${a.listingMls}` : ""}${a.notes ? ` · ${a.notes.slice(0, 120)}` : ""}`,
      mlsNumber: a.listingMls,
      path: a.listingMls ? `/listing/${a.listingMls}` : null,
      imageUrl: null,
      createdAt: a.createdAt,
    });
  }

  if (input.customerId) {
    const customerId = input.customerId;
    const [events, views, saves, searches, monitors, areaMonitors, alerts] =
      await Promise.all([
        want(sources, "events")
          ? prisma.activityEvent.findMany({
              where: {
                userId: customerId,
                type: { not: "HEARTBEAT" },
                ...(createdAt ? { createdAt } : {}),
              },
              orderBy: { createdAt: "desc" },
              take: perSource,
              select: TIMELINE_ACTIVITY_EVENT_SELECT,
            })
          : Promise.resolve([]),
        want(sources, "views")
          ? prisma.listingView.findMany({
              where: {
                userId: customerId,
                ...(createdAt ? { createdAt } : {}),
              },
              orderBy: { createdAt: "desc" },
              take: perSource,
              select: { id: true, mlsNumber: true, createdAt: true },
            })
          : Promise.resolve([]),
        want(sources, "saves")
          ? prisma.savedListing.findMany({
              where: {
                userId: customerId,
                ...(createdAt ? { createdAt } : {}),
              },
              orderBy: { createdAt: "desc" },
              take: perSource,
              select: { id: true, mlsNumber: true, createdAt: true },
            })
          : Promise.resolve([]),
        want(sources, "searches")
          ? prisma.savedSearch.findMany({
              where: {
                userId: customerId,
                ...(createdAt ? { createdAt } : {}),
              },
              orderBy: { createdAt: "desc" },
              take: perSource,
              select: {
                id: true,
                name: true,
                emailAlerts: true,
                createdAt: true,
              },
            })
          : Promise.resolve([]),
        want(sources, "monitors")
          ? prisma.propertyMonitor.findMany({
              where: {
                userId: customerId,
                ...(createdAt ? { createdAt } : {}),
              },
              orderBy: { createdAt: "desc" },
              take: perSource,
              select: { id: true, mlsNumber: true, createdAt: true },
            })
          : Promise.resolve([]),
        want(sources, "areaMonitors")
          ? prisma.areaMonitor.findMany({
              where: {
                userId: customerId,
                ...(createdAt ? { createdAt } : {}),
              },
              orderBy: { createdAt: "desc" },
              take: perSource,
              select: {
                id: true,
                name: true,
                city: true,
                community: true,
                createdAt: true,
              },
            })
          : Promise.resolve([]),
        want(sources, "alerts")
          ? prisma.customerAlert.findMany({
              where: {
                userId: customerId,
                ...(createdAt ? { createdAt } : {}),
              },
              orderBy: { createdAt: "desc" },
              take: perSource,
              select: {
                id: true,
                title: true,
                kind: true,
                mlsNumber: true,
                createdAt: true,
              },
            })
          : Promise.resolve([]),
      ]);

    for (const e of events) {
      const mlsNumber =
        mlsNumberFromListingPath(e.path) ?? e.mlsNumber ?? null;
      const fromAlert =
        e.type === "LISTING_VIEW" &&
        (isPropertyAlertUtmCampaign(e.utmCampaign) ||
          pathLooksLikePropertyAlert(e.path));
      items.push({
        id: `ae-${e.id}`,
        source: "activity",
        type: fromAlert ? "PROPERTY_ALERT_VIEW" : e.type,
        title: fromAlert
          ? "Viewed from property alert"
          : e.title || labelActivity(e.type),
        body: e.path,
        mlsNumber,
        path: e.path,
        imageUrl: null,
        createdAt: e.createdAt,
      });
    }
    for (const v of views) {
      items.push({
        id: `view-${v.id}`,
        source: "domain",
        type: "LISTING_VIEW",
        title: "Property view",
        body: null,
        mlsNumber: v.mlsNumber,
        path: `/listing/${v.mlsNumber}`,
        imageUrl: null,
        createdAt: v.createdAt,
      });
    }
    for (const s of saves) {
      items.push({
        id: `save-${s.id}`,
        source: "domain",
        type: "SAVE_LISTING",
        title: "Favorite",
        body: null,
        mlsNumber: s.mlsNumber,
        path: `/listing/${s.mlsNumber}`,
        imageUrl: null,
        createdAt: s.createdAt,
      });
    }
    for (const s of searches) {
      items.push({
        id: `search-${s.id}`,
        source: "domain",
        type: "SAVE_SEARCH",
        title: s.name || "Saved search",
        body: s.emailAlerts ? "Email alerts on" : "Alerts off",
        mlsNumber: null,
        path: "/account/searches",
        imageUrl: null,
        createdAt: s.createdAt,
      });
    }
    for (const m of monitors) {
      items.push({
        id: `mon-${m.id}`,
        source: "domain",
        type: "WATCH_PROPERTY",
        title: "Property alert",
        body: null,
        mlsNumber: m.mlsNumber,
        path: `/listing/${m.mlsNumber}`,
        imageUrl: null,
        createdAt: m.createdAt,
      });
    }
    for (const a of areaMonitors) {
      items.push({
        id: `area-${a.id}`,
        source: "domain",
        type: "WATCH_AREA",
        title: a.name || a.city || "Area alert",
        body: [a.city, a.community].filter(Boolean).join(" · ") || null,
        mlsNumber: null,
        path: "/account",
        imageUrl: null,
        createdAt: a.createdAt,
      });
    }
    for (const alert of alerts) {
      items.push({
        id: `alert-${alert.id}`,
        source: "domain",
        type: "PROPERTY_ALERT",
        title: alert.title || alert.kind.replaceAll("_", " "),
        body: null,
        mlsNumber: alert.mlsNumber,
        path: alert.mlsNumber ? `/listing/${alert.mlsNumber}` : null,
        imageUrl: null,
        createdAt: alert.createdAt,
      });
    }
  }

  items.sort((a, b) => {
    const aPinned = Boolean(a.pinned);
    const bPinned = Boolean(b.pinned);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const deduped = dedupeNearDuplicateListingViews(items);
  const filtered = restrictFilters
    ? deduped.filter((item) =>
        timelineItemMatchesFilters(item.type, restrictFilters),
      )
    : deduped;
  const hasMore = filtered.length > take;
  const page = filtered.slice(0, take);
  const withCovers = await enrichWithListingCovers(page);
  return {
    items: withCovers.map(serializeTimelineItem),
    hasMore,
    scope: input.scope,
  };
}
