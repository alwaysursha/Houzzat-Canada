import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AppointmentType } from "@prisma/client";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { LaunchpadBoard } from "@/components/agent/LaunchpadBoard";
import { LaunchpadDeskIdentity } from "@/components/agent/LaunchpadDeskIdentity";
import { requireAgentContext } from "@/lib/agent";
import { DESK_AGENT_COOKIE, resolveDeskView } from "@/lib/agent/brokerage";
import { launchpadIdentityPresentation } from "@/lib/agent/resolve-desk-view";
import { loadDeskActivityFeed } from "@/lib/agent/desk-activity";
import {
  loadLaunchpadAvgResponseMins,
  loadLaunchpadContactRequested,
  loadLaunchpadHotLeads,
  loadLaunchpadOnlineLeads,
  loadLaunchpadUnreadMessages,
} from "@/lib/agent/launchpad-deferred";
import {
  agentTaskTenantWhere,
  leadWhereForDesk,
} from "@/lib/crm-read-scope";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Launchpad · Agent CRM" };

const TIME_ZONE = "America/Toronto";

function personName(person: { name: string | null; email: string } | null): string {
  return person?.name?.trim() || person?.email || "Lead";
}

function launchpadOwnerName(
  desk: {
    deskAgentId: string | null;
    deskLabel: string;
    teamAgents: Array<{ id: string; name: string | null; email: string }>;
  },
  viewer: { id: string; name: string | null; email: string },
): string {
  if (!desk.deskAgentId) return "Team overview";
  const owner = desk.teamAgents.find((agent) => agent.id === desk.deskAgentId);
  const named =
    owner?.name?.trim() ||
    (desk.deskAgentId === viewer.id ? viewer.name?.trim() : "") ||
    "";
  if (named) return named;
  const label = desk.deskLabel.trim();
  if (label && label !== "My desk") return label;
  return owner?.email || viewer.email;
}

function appointmentTitle(type: AppointmentType): string {
  switch (type) {
    case "SHOWING":
      return "Buyer viewing";
    case "VIRTUAL_VIEWING":
      return "Virtual viewing";
    case "BUYER_SESSION":
      return "Buyer consultation";
    case "VALUATION_CALL":
      return "Valuation call";
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
}

function sourceLabel(source: string): string {
  return source.replaceAll("_", " ").toLowerCase();
}

function launchpadLeadsView(
  canSeeTeamLeads: boolean,
  viewerId: string,
  focusAgentId: string | null,
): "mine" | "team" {
  if (!canSeeTeamLeads || focusAgentId === viewerId) return "mine";
  return "team";
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second"),
  );
  return asUtc - date.getTime();
}

function torontoDayBounds(now: Date): { start: Date; end: Date } {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const start = new Date(utcMidnight.getTime() - timeZoneOffsetMs(utcMidnight, TIME_ZONE));
  const corrected = new Date(utcMidnight.getTime() - timeZoneOffsetMs(start, TIME_ZONE));
  return { start: corrected, end: new Date(corrected.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

export default async function AgentLaunchpadPage() {
  const deskCookie = (await cookies()).get(DESK_AGENT_COOKIE)?.value ?? null;
  const ctx = await requireAgentContext();
  if (!ctx) redirect(await staffSignInRedirectUrl("/agent"));

  const now = new Date();
  const { start: startOfDay, end: endOfDay } = torontoDayBounds(now);

  const desk = await resolveDeskView({ ...ctx, deskCookie });
  const deskView = (ctx.canSeeTeamLeads ? "team" : "mine") as "mine" | "team";
  const focusAgentId = desk.deskAgentId;
  const leadsView = launchpadLeadsView(ctx.canSeeTeamLeads, ctx.user.id, focusAgentId);
  const identity = launchpadIdentityPresentation({
    viewerUserId: ctx.user.id,
    deskAgentId: desk.deskAgentId,
    deskLabel: desk.deskLabel,
  });
  const deskLeadBase = leadWhereForDesk(ctx, focusAgentId);
  const callNewLeadsWhere = { ...deskLeadBase, status: "NEW_LEAD" as const };
  const assigneeFilter = focusAgentId
    ? { assigneeId: focusAgentId }
    : ctx.canSeeTeamLeads
      ? {}
      : { assigneeId: ctx.user.id };

  const [
    overdueTaskCount,
    dueTodayCount,
    newLeadCount,
    callNewLeadsRaw,
    openTasks,
    appointments,
    contactRequested,
    avgResponseMins,
    online,
    hot,
    unread,
    activity,
  ] = await Promise.all([
    prisma.agentTask.count({
      where: {
        ...agentTaskTenantWhere(ctx),
        status: "OPEN",
        dueAt: { lt: now },
        ...assigneeFilter,
      },
    }),
    prisma.agentTask.count({
      where: {
        ...agentTaskTenantWhere(ctx),
        status: "OPEN",
        dueAt: { gte: startOfDay, lte: endOfDay },
        ...assigneeFilter,
      },
    }),
    prisma.lead.count({ where: callNewLeadsWhere }),
    prisma.lead.findMany({
      where: callNewLeadsWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        customer: { select: { name: true, email: true, phone: true } },
      },
    }),
    prisma.agentTask.findMany({
      where: {
        ...agentTaskTenantWhere(ctx),
        status: "OPEN",
        ...assigneeFilter,
      },
      orderBy: { dueAt: "asc" },
      take: 12,
      include: {
        lead: {
          select: {
            id: true,
            customer: { select: { name: true, email: true, phone: true } },
          },
        },
      },
    }),
    prisma.appointment.findMany({
      where: {
        lead: deskLeadBase,
        OR: [
          { status: "REQUESTED" },
          {
            status: { in: ["CONFIRMED", "RESCHEDULED"] },
            startsAt: { gte: now },
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }],
      take: 16,
      select: {
        id: true,
        type: true,
        status: true,
        listingMls: true,
        notes: true,
        startsAt: true,
        createdAt: true,
        leadId: true,
        customer: { select: { name: true, email: true } },
      },
    }),
    loadLaunchpadContactRequested({ ctx, focusAgentId }),
    loadLaunchpadAvgResponseMins({ ctx, focusAgentId }),
    loadLaunchpadOnlineLeads({ ctx, deskView, focusAgentId }),
    loadLaunchpadHotLeads(ctx, focusAgentId),
    loadLaunchpadUnreadMessages(ctx),
    loadDeskActivityFeed({ ctx, take: 12, deskAgentId: focusAgentId }),
  ]);

  const mlsNumbers = [
    ...new Set(
      [...appointments, ...contactRequested]
        .map((row) => row.listingMls)
        .filter((mls): mls is string => Boolean(mls)),
    ),
  ];
  const listings = mlsNumbers.length
    ? await prisma.listing.findMany({
        where: { mlsNumber: { in: mlsNumbers } },
        select: { mlsNumber: true, addressLine: true, city: true },
      })
    : [];
  const addressByMls = new Map(
    listings.map((listing) => [
      listing.mlsNumber,
      listing.addressLine || listing.city,
    ]),
  );

  const hotPreview = hot.hotLeads[0] ?? null;
  const hotRecord = hotPreview
    ? await prisma.lead.findFirst({
        where: { id: hotPreview.id, ...deskLeadBase },
        select: {
          id: true,
          customer: { select: { name: true, email: true, phone: true } },
        },
      })
    : null;

  const activityLeadIds = activity.map((item) => item.leadId);
  const activityPhones = activityLeadIds.length
    ? await prisma.lead.findMany({
        where: { id: { in: activityLeadIds }, ...deskLeadBase },
        select: {
          id: true,
          customer: { select: { phone: true } },
        },
      })
    : [];
  const phoneByLead = new Map(
    activityPhones.map((lead) => [lead.id, lead.customer?.phone ?? null]),
  );

  const when = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
  });
  const clock = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });

  const bookings = appointments
    .filter((row) => row.status === "REQUESTED" || row.startsAt)
    .slice(0, 6)
    .map((row) => {
      const place = row.listingMls
        ? addressByMls.get(row.listingMls) || `MLS ${row.listingMls}`
        : "No property attached";
      const awaiting = row.status === "REQUESTED";
      return {
        id: row.id,
        title: appointmentTitle(row.type),
        who: `${personName(row.customer)} · ${place}`,
        whenLabel: row.startsAt
          ? when.format(row.startsAt)
          : `${when.format(row.createdAt)} requested`,
        awaiting,
        detail: row.notes?.trim() || `${personName(row.customer)} asked for ${appointmentTitle(row.type).toLowerCase()} at ${place}.`,
        href: `/agent/appointments#${row.id}`,
      };
    });

  const upcoming = appointments
    .filter((row) => row.startsAt && row.startsAt.getTime() >= now.getTime() && row.status !== "REQUESTED")
    .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0))
    .slice(0, 4)
    .map((row) => ({
      id: row.id,
      dayLabel: row.startsAt ? day.format(row.startsAt) : "",
      title: appointmentTitle(row.type),
      whenLabel: `${row.startsAt ? clock.format(row.startsAt) : ""} · ${personName(row.customer)}`,
      href: `/agent/appointments#${row.id}`,
    }));

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      {ctx.canSeeTeamLeads ? (
        <LaunchpadDeskIdentity
          text={identity.text}
          mode={identity.mode}
          ownUserId={ctx.user.id}
        />
      ) : null}
      <LaunchpadBoard
        dateLabel={now.toLocaleDateString("en-CA", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: TIME_ZONE,
        })}
        dateTime={now.toISOString()}
        agentName={launchpadOwnerName(desk, ctx.user)}
        leadsView={leadsView}
        newLeadCount={newLeadCount}
        newLeads={callNewLeadsRaw.map((lead) => ({
          id: lead.id,
          name: personName(lead.customer),
          detail: "New lead",
          phone: lead.customer?.phone ?? null,
        }))}
        unreadCount={unread.unreadMessageCount}
        messages={unread.messages.slice(0, 6).map((row) => ({
          leadId: row.leadId,
          name: row.displayName,
          preview: row.preview,
        }))}
        responseMins={avgResponseMins}
        onlineCount={online.filter((lead) => lead.isOnline).length}
        onlineLeads={online
          .filter((lead) => lead.isOnline)
          .slice(0, 8)
          .map((lead) => ({
            id: lead.id,
            name: personName(lead.customer),
            detail: "Active now",
            phone: null,
          }))}
        bookings={bookings}
        hotLead={
          hotRecord
            ? {
                id: hotRecord.id,
                name: personName(hotRecord.customer),
                detail: hotPreview?.meta ?? "High activity",
                phone: hotRecord.customer?.phone ?? null,
              }
            : null
        }
        hotCount={hot.hotCount}
        overdueCount={overdueTaskCount}
        dueTodayCount={dueTodayCount}
        tasks={openTasks.map((task) => ({
          id: task.id,
          title: task.title,
          name: personName(task.lead?.customer ?? null),
          dueLabel: task.dueAt.getTime() < now.getTime()
            ? `Overdue since ${day.format(task.dueAt)}`
            : `Due ${day.format(task.dueAt)}`,
          overdue: task.dueAt.getTime() < now.getTime(),
          phone: task.lead?.customer?.phone ?? null,
          leadId: task.lead?.id ?? null,
        }))}
        contacts={contactRequested.slice(0, 8).map((lead) => ({
          id: lead.id,
          name: personName(lead.customer),
          detail: lead.listingMls
            ? `${sourceLabel(lead.source)} · ${addressByMls.get(lead.listingMls) || lead.listingMls}`
            : sourceLabel(lead.source),
          phone: lead.customer?.phone ?? null,
        }))}
        upcoming={upcoming}
        activity={activity.map((item) => ({
          id: item.id,
          category: item.category,
          name: item.actorName || item.leadName,
          action: item.action,
          whenLabel: clock.format(new Date(item.createdAt)),
          kindLabel:
            item.category === "views_favorites"
              ? "Listing views"
              : item.category === "property_alerts"
                ? "Alert opened"
                : item.category === "communications"
                  ? "Message"
                  : "CRM update",
          leadId: item.leadId,
          phone: phoneByLead.get(item.leadId) ?? null,
        }))}
      />
    </div>
  );
}
