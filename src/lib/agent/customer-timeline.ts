import type { ActivityEventType } from "@prisma/client";
import { isPropertyAlertEmailKind } from "@/lib/agent/email-alert-kinds";
import {
  isPropertyAlertUtmCampaign,
  pathLooksLikePropertyAlert,
} from "@/lib/email/property-alert-links";
import { mlsNumberFromListingPath } from "@/lib/listings/listing-path";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { prisma } from "@/lib/prisma";

/** Narrow CRM list columns — never htmlBody (preview uses GET /api/agent/emails/[id]). */
export const LEAD_PROFILE_EMAIL_LOG_SELECT = {
  id: true,
  subject: true,
  body: true,
  toEmail: true,
  kind: true,
  mlsNumber: true,
  openedAt: true,
  clickedAt: true,
  openCount: true,
  clickCount: true,
  lastClickedUrl: true,
  createdAt: true,
} as const;

export type LeadProfileEmailLog = {
  id: string;
  subject: string;
  body: string;
  toEmail: string;
  kind: string;
  mlsNumber: string | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  openCount: number;
  clickCount: number;
  lastClickedUrl: string | null;
  createdAt: Date;
};

export type LeadProfileNote = {
  id: string;
  body: string;
  category: "GENERAL" | "CALL";
  pinned: boolean;
  pinnedAt: Date | null;
  createdAt: Date;
  author: { name: string | null; email: string };
};

export type LeadProfileTask = {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string | null;
  dueAt: Date;
  completedAt: Date | null;
  createdAt: Date;
};

export type LeadProfileAppointment = {
  id: string;
  type: string;
  status: string;
  startsAt: Date | null;
  listingMls: string | null;
  videoJoinUrl: string | null;
  notes: string | null;
  createdAt: Date;
};

export type LeadProfileCollections = {
  emails: LeadProfileEmailLog[] | Promise<LeadProfileEmailLog[]>;
  notes: LeadProfileNote[] | Promise<LeadProfileNote[]>;
  tasks: LeadProfileTask[] | Promise<LeadProfileTask[]>;
  appointments: LeadProfileAppointment[] | Promise<LeadProfileAppointment[]>;
};

export type TimelineItem = {
  id: string;
  source: "activity" | "lead" | "domain" | "email" | "note" | "task";
  type: string;
  title: string;
  body: string | null;
  mlsNumber: string | null;
  path: string | null;
  /** Primary listing cover when the row is MLS-linked. */
  imageUrl: string | null;
  createdAt: Date;
  /** LeadNote fields when source is note. */
  noteId?: string | null;
  noteCategory?: "GENERAL" | "CALL" | null;
  pinned?: boolean;
  pinnedAt?: Date | null;
  /** CRM email preview path when source is email. */
  emailPreviewPath?: string | null;
  emailKind?: string | null;
  emailOpenedAt?: Date | null;
  emailClickedAt?: Date | null;
  emailOpenCount?: number;
  emailClickCount?: number;
  lastClickedUrl?: string | null;
};

function formatListingAddress(listing: {
  addressLine: string;
  unitNumber: string | null;
  city: string;
  province: string;
  postalCode: string | null;
}) {
  const street = listing.unitNumber
    ? `${listing.addressLine} #${listing.unitNumber}`
    : listing.addressLine;
  const postal = listing.postalCode ? ` ${listing.postalCode}` : "";
  return `${street}, ${listing.city}, ${listing.province}${postal}`;
}

function pickCoverUrl(
  media: Array<{ url: string; isPrimary: boolean; sortOrder: number }>,
): string | null {
  if (!media.length) return null;
  const primary = media.find((m) => m.isPrimary) ?? media[0];
  return listingPhotoSrc(primary.url) ?? primary.url;
}

const GENERIC_LISTING_TITLES = new Set([
  "property view",
  "saved listing",
  "property watch",
  "listing note",
  "listing view",
  "page view",
]);

async function enrichWithListingCovers(
  items: TimelineItem[],
): Promise<TimelineItem[]> {
  const mlsNumbers = [
    ...new Set(
      items
        .map((item) => item.mlsNumber)
        .filter((mls): mls is string => Boolean(mls)),
    ),
  ];
  if (!mlsNumbers.length) return items;

  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: mlsNumbers } },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      province: true,
      postalCode: true,
      media: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { url: true, isPrimary: true, sortOrder: true },
      },
    },
  });

  const byMls = new Map(
    listings.map((listing) => [
      listing.mlsNumber,
      {
        address: formatListingAddress(listing),
        imageUrl: pickCoverUrl(listing.media),
      },
    ]),
  );

  return items.map((item) => {
    if (!item.mlsNumber) return item;
    const listing = byMls.get(item.mlsNumber);
    if (!listing) return item;
    const titleIsGeneric =
      !item.title?.trim() ||
      GENERIC_LISTING_TITLES.has(item.title.trim().toLowerCase());
    return {
      ...item,
      title: titleIsGeneric ? listing.address : item.title,
      imageUrl: listing.imageUrl,
    };
  });
}

function labelActivity(type: ActivityEventType | string) {
  switch (type) {
    case "contact_update_request":
      return "Contact update requested";
    case "contact_updated_by_customer":
      return "Contact updated by customer";
    case "contact_update":
      return "Contact updated";
    default:
      return String(type).replaceAll("_", " ");
  }
}

/** Merged second-by-second customer journey for agent CRM. */
export async function loadCustomerTimeline(input: {
  leadId: string;
  customerId: string | null;
  take?: number;
  /** When set, emails/notes/tasks/appointments are not queried again. */
  collections: LeadProfileCollections;
}): Promise<TimelineItem[]> {
  const take = input.take ?? 120;
  const items: TimelineItem[] = [];

  const [leadActs, notes, emails, tasks, appointments] = await Promise.all([
    prisma.leadActivity.findMany({
      where: { leadId: input.leadId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        type: true,
        body: true,
        meta: true,
        createdAt: true,
      },
    }),
    input.collections.notes,
    input.collections.emails,
    input.collections.tasks,
    input.collections.appointments,
  ]);

  for (const a of leadActs) {
    // LeadNote rows are the source of truth for notes (category / pin).
    if (a.type === "note") continue;
    // LeadEmailLog is the source of truth for sent mail (avoids duplicate rows).
    if (a.type === "email_sent") continue;

    const meta =
      a.meta && typeof a.meta === "object" && !Array.isArray(a.meta)
        ? (a.meta as Record<string, unknown>)
        : null;
    const previewPath =
      typeof meta?.previewPath === "string" ? meta.previewPath : null;
    const emailLogId =
      typeof meta?.emailLogId === "string" ? meta.emailLogId : null;
    const clickUrl = typeof meta?.url === "string" ? meta.url : null;

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
      mlsNumber:
        typeof meta?.mlsNumber === "string" ? meta.mlsNumber : null,
      path: null,
      imageUrl: null,
      createdAt: a.createdAt,
      emailPreviewPath:
        previewPath ??
        (emailLogId ? `/agent/emails/${emailLogId}` : null),
      lastClickedUrl: clickUrl,
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
      body: e.body.slice(0, 280),
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
    const [
      events,
      views,
      saves,
      searches,
      monitors,
      areaMonitors,
      listingNotes,
      tours,
      alerts,
    ] = await Promise.all([
      prisma.activityEvent.findMany({
        where: {
          userId: input.customerId,
          type: { not: "HEARTBEAT" },
        },
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.listingView.findMany({
        where: { userId: input.customerId },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.savedListing.findMany({
        where: { userId: input.customerId },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.savedSearch.findMany({
        where: { userId: input.customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.propertyMonitor.findMany({
        where: { userId: input.customerId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.areaMonitor.findMany({
        where: { userId: input.customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.listingNote.findMany({
        where: { userId: input.customerId },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),
      prisma.viewingTour.findMany({
        where: { userId: input.customerId },
        orderBy: { updatedAt: "desc" },
        take: 15,
        include: { stops: { select: { mlsNumber: true } } },
      }),
      prisma.customerAlert.findMany({
        where: { userId: input.customerId },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
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
        body: alert.body.slice(0, 200),
        mlsNumber: alert.mlsNumber,
        path: alert.mlsNumber ? `/listing/${alert.mlsNumber}` : null,
        imageUrl: null,
        createdAt: alert.createdAt,
      });
    }
    for (const n of listingNotes) {
      items.push({
        id: `ln-${n.id}`,
        source: "domain",
        type: "NOTE",
        title: "Listing note",
        body: n.body.slice(0, 200),
        mlsNumber: n.mlsNumber,
        path: `/listing/${n.mlsNumber}`,
        imageUrl: null,
        createdAt: n.updatedAt,
      });
    }
    for (const t of tours) {
      items.push({
        id: `tour-${t.id}`,
        source: "domain",
        type: "ROUTE_PLANNER",
        title: t.name || "Viewing route",
        body: `${t.stops.length} stops · ${t.status}`,
        mlsNumber: t.stops[0]?.mlsNumber ?? null,
        path: "/route-planner",
        imageUrl: null,
        createdAt: t.updatedAt,
      });
    }
  }

  items.sort((a, b) => {
    const aPinned = Boolean(a.pinned);
    const bPinned = Boolean(b.pinned);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned) {
      const aPin = a.pinnedAt?.getTime() ?? a.createdAt.getTime();
      const bPin = b.pinnedAt?.getTime() ?? b.createdAt.getTime();
      if (aPin !== bPin) return bPin - aPin;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const deduped = dedupeNearDuplicateListingViews(items);
  // Keep all pinned notes even if they would fall outside the take window.
  const pinned = deduped.filter((item) => item.pinned);
  const unpinned = deduped.filter((item) => !item.pinned);
  const trimmed = [...pinned, ...unpinned.slice(0, Math.max(0, take - pinned.length))];
  return enrichWithListingCovers(trimmed);
}

/**
 * Listing pages write both ActivityEvent (beacon) and ListingView (server).
 * Collapse same-MLS LISTING_VIEW rows within a short window into one,
 * preferring the richer activity-event title when present.
 */
function dedupeNearDuplicateListingViews(items: TimelineItem[]): TimelineItem[] {
  const WINDOW_MS = 60_000;
  const kept: TimelineItem[] = [];

  for (const item of items) {
    if (item.type !== "LISTING_VIEW" || !item.mlsNumber) {
      kept.push(item);
      continue;
    }

    const existingIdx = kept.findIndex((other) => {
      if (other.type !== "LISTING_VIEW" || other.mlsNumber !== item.mlsNumber) {
        return false;
      }
      return (
        Math.abs(other.createdAt.getTime() - item.createdAt.getTime()) <=
        WINDOW_MS
      );
    });

    if (existingIdx < 0) {
      kept.push(item);
      continue;
    }

    const existing = kept[existingIdx]!;
    // Prefer activity-source rows (page title) over generic "Property view".
    const itemIsGeneric = /^property view$/i.test(item.title.trim());
    const existingIsGeneric = /^property view$/i.test(existing.title.trim());
    const preferItem =
      (item.source === "activity" && existing.source !== "activity") ||
      (!itemIsGeneric && existingIsGeneric) ||
      (item.source === existing.source &&
        !itemIsGeneric &&
        item.title.length > existing.title.length);

    if (preferItem) {
      kept[existingIdx] = item;
    }
  }

  return kept;
}
