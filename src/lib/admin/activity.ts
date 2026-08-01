import type { ActivityEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const LIVE_VISITOR_WINDOW_MS = 3 * 60 * 1000;

export type BeaconPayload = {
  visitorKey: string;
  sessionKey: string;
  type: ActivityEventType | string;
  path?: string | null;
  title?: string | null;
  mlsNumber?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  meta?: Record<string, unknown> | null;
};

const EVENT_TYPES = new Set<string>([
  "PAGE_VIEW",
  "HEARTBEAT",
  "LISTING_VIEW",
  "SEARCH",
  "SAVE_LISTING",
  "UNSAVE_LISTING",
  "SAVE_SEARCH",
  "WATCH_PROPERTY",
  "WATCH_AREA",
  "NOTE",
  "LEAD",
  "SIGN_IN",
  "SIGN_UP",
  "ROUTE_PLANNER",
  "LANDING_VIEW",
  "OTHER",
]);

function normalizeType(raw: string): ActivityEventType {
  const t = raw.trim().toUpperCase();
  if (EVENT_TYPES.has(t)) return t as ActivityEventType;
  return "OTHER";
}

export async function ingestActivityBeacon(
  payload: BeaconPayload,
  opts: {
    userId?: string | null;
    userAgent?: string | null;
  } = {},
) {
  const visitorKey = payload.visitorKey?.trim();
  const sessionKey = payload.sessionKey?.trim();
  if (!visitorKey || !sessionKey) {
    throw new Error("visitorKey and sessionKey are required");
  }

  const type = normalizeType(String(payload.type || "OTHER"));
  const now = new Date();
  const path = payload.path?.slice(0, 500) || null;
  const title = payload.title?.slice(0, 300) || null;
  const mlsNumber = payload.mlsNumber?.trim().slice(0, 40) || null;
  const referrer = payload.referrer?.slice(0, 1000) || null;

  const visitor = await prisma.siteVisitor.upsert({
    where: { visitorKey },
    create: {
      visitorKey,
      userId: opts.userId ?? undefined,
      userAgent: opts.userAgent?.slice(0, 500) || undefined,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      lastSeenAt: now,
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.userAgent
        ? { userAgent: opts.userAgent.slice(0, 500) }
        : {}),
    },
  });

  const existingSession = await prisma.siteSession.findUnique({
    where: { sessionKey },
    select: { id: true, pageCount: true },
  });

  const isPageLike = type === "PAGE_VIEW" || type === "LISTING_VIEW" || type === "LANDING_VIEW";

  const session = existingSession
    ? await prisma.siteSession.update({
        where: { sessionKey },
        data: {
          lastSeenAt: now,
          endedAt: null,
          ...(isPageLike ? { pageCount: { increment: 1 } } : {}),
        },
      })
    : await prisma.siteSession.create({
        data: {
          sessionKey,
          visitorId: visitor.id,
          startedAt: now,
          lastSeenAt: now,
          landingPath: path ?? undefined,
          landingReferrer: referrer ?? undefined,
          utmSource: payload.utmSource?.slice(0, 120) || undefined,
          utmMedium: payload.utmMedium?.slice(0, 120) || undefined,
          utmCampaign: payload.utmCampaign?.slice(0, 160) || undefined,
          utmContent: payload.utmContent?.slice(0, 160) || undefined,
          utmTerm: payload.utmTerm?.slice(0, 160) || undefined,
          pageCount: isPageLike ? 1 : 0,
        },
      });

  // Heartbeats only refresh presence — skip cluttering the timeline.
  if (type === "HEARTBEAT") {
    return { visitorId: visitor.id, sessionId: session.id, eventId: null };
  }

  const event = await prisma.activityEvent.create({
    data: {
      type,
      visitorId: visitor.id,
      sessionId: session.id,
      userId: opts.userId ?? visitor.userId ?? undefined,
      path: path ?? undefined,
      title: title ?? undefined,
      mlsNumber: mlsNumber ?? undefined,
      referrer: referrer ?? undefined,
      utmSource: payload.utmSource?.slice(0, 120) || undefined,
      utmMedium: payload.utmMedium?.slice(0, 120) || undefined,
      utmCampaign: payload.utmCampaign?.slice(0, 160) || undefined,
      meta: (payload.meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  return {
    visitorId: visitor.id,
    sessionId: session.id,
    eventId: event.id,
  };
}

export function liveSinceDate(now = new Date()) {
  return new Date(now.getTime() - LIVE_VISITOR_WINDOW_MS);
}

export function formatActivityLabel(type: ActivityEventType): string {
  switch (type) {
    case "PAGE_VIEW":
      return "Page view";
    case "HEARTBEAT":
      return "Online";
    case "LISTING_VIEW":
      return "Viewed listing";
    case "SEARCH":
      return "Searched";
    case "SAVE_LISTING":
      return "Saved home";
    case "UNSAVE_LISTING":
      return "Removed saved home";
    case "SAVE_SEARCH":
      return "Saved search";
    case "WATCH_PROPERTY":
      return "Watchlisted property";
    case "WATCH_AREA":
      return "Watched area";
    case "NOTE":
      return "Listing note";
    case "LEAD":
      return "Lead / inquiry";
    case "SIGN_IN":
      return "Signed in";
    case "SIGN_UP":
      return "Signed up";
    case "ROUTE_PLANNER":
      return "Route planner";
    case "LANDING_VIEW":
      return "Landing page";
    case "OTHER":
      return "Activity";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
