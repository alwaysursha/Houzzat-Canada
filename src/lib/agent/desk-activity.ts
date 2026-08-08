import type { Prisma } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { resolveDeskView } from "@/lib/agent/brokerage";
import { isPropertyAlertEmailKind } from "@/lib/agent/email-alert-kinds";
import { prisma } from "@/lib/prisma";

export const DESK_ACTIVITY_CATEGORIES = [
  "all",
  "notes",
  "views_favorites",
  "agent_actions",
  "communications",
] as const;

export type DeskActivityCategory = (typeof DESK_ACTIVITY_CATEGORIES)[number];

export type DeskActivityItem = {
  id: string;
  category: Exclude<DeskActivityCategory, "all">;
  type: string;
  actorName: string | null;
  action: string;
  leadId: string;
  leadName: string;
  detail: string | null;
  createdAt: string;
};

function leadDisplayName(lead: {
  customer: { name: string | null; email: string } | null;
}): string {
  const name = lead.customer?.name?.trim();
  if (name) return name;
  const email = lead.customer?.email?.trim();
  if (email) return email;
  return "Lead";
}

function categoryForType(type: string): Exclude<DeskActivityCategory, "all"> {
  const t = type.toUpperCase();
  if (t === "NOTE" || t === "CALL_NOTE" || t === "NOTE_PIN") {
    return "notes";
  }
  if (
    t === "LISTING_VIEW" ||
    t === "SAVE_LISTING" ||
    t === "UNSAVE_LISTING" ||
    t === "SAVE_SEARCH" ||
    t === "SEARCH" ||
    t === "WATCH_PROPERTY" ||
    t === "WATCH_AREA" ||
    t === "PAGE_VIEW" ||
    t === "LANDING_VIEW"
  ) {
    return "views_favorites";
  }
  if (
    t.includes("EMAIL") ||
    t === "SHORTLIST_EMAILED" ||
    t === "AGENT_MESSAGE" ||
    t === "DIGEST_EMAIL" ||
    t === "PROPERTY_ALERT_EMAIL" ||
    t === "SMS" ||
    t === "TEXT" ||
    t === "CALL"
  ) {
    return "communications";
  }
  return "agent_actions";
}

function leadWhereForDesk(
  ctx: AgentOrgContext,
  deskAgentId: string | null,
): Prisma.LeadWhereInput {
  const org: Prisma.LeadWhereInput = {
    organizationId: { in: ctx.organizationIds },
  };
  if (ctx.canSeeTeamLeads) {
    if (deskAgentId) return { ...org, assignedAgentId: deskAgentId };
    return org;
  }
  return { ...org, assignedAgentId: ctx.user.id };
}

function sanitizeDetail(text: string | null | undefined, max = 100): string | null {
  if (!text?.trim()) return null;
  let value = text.trim();
  value = value.replace(/https?:\/\/[^\s]+/gi, (url) => {
    if (url.includes("/share/")) return "shared homes link";
    return "link";
  });
  value = value.replace(
    /\/(?:share\/homes\/)?eyJ[A-Za-z0-9_-]{20,}/g,
    "shared homes link",
  );
  value = value.replace(/[A-Za-z0-9_-]{48,}/g, (token) => `${token.slice(0, 12)}…`);
  if (value.length > max) value = `${value.slice(0, max - 1)}…`;
  return value;
}

function actionForLeadActivity(type: string, body: string | null): string {
  const t = type.toLowerCase();
  if (t === "status_change") return "updated pipeline for";
  if (t === "claimed") return "claimed";
  if (t === "reassigned" || t === "assigned") return "reassigned";
  if (t === "note" || t === "note_pin") return "added a note on";
  if (t === "reminder_set") return "set a reminder for";
  if (t === "inquiry_tag") return "tagged";
  if (t === "contact_update" || t === "contact_verify")
    return "updated contact for";
  if (t === "shortlist_emailed") return "sent a shortlist to";
  if (t === "email_sent") return "sent a message to";
  if (body?.trim()) return sanitizeDetail(body, 80) ?? "logged activity on";
  return "logged activity on";
}

export async function loadDeskActivityFeed(input: {
  ctx: AgentOrgContext;
  category?: DeskActivityCategory;
  take?: number;
}): Promise<DeskActivityItem[]> {
  const take = Math.min(Math.max(input.take ?? 60, 1), 120);
  const category = input.category ?? "all";
  const desk = await resolveDeskView(input.ctx);
  const leadWhere = leadWhereForDesk(input.ctx, desk.deskAgentId);

  const leads = await prisma.lead.findMany({
    where: leadWhere,
    select: {
      id: true,
      customerId: true,
      customer: { select: { name: true, email: true } },
    },
    take: 500,
    orderBy: { updatedAt: "desc" },
  });

  if (leads.length === 0) return [];

  const leadById = new Map(leads.map((l) => [l.id, l]));
  const leadIds = leads.map((l) => l.id);
  const customerIds = [
    ...new Set(
      leads
        .map((l) => l.customerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const customerToLead = new Map<string, (typeof leads)[number]>();
  for (const lead of leads) {
    if (lead.customerId && !customerToLead.has(lead.customerId)) {
      customerToLead.set(lead.customerId, lead);
    }
  }

  const perSource = Math.min(take, 80);

  const [activities, notes, emails, events, appointments] = await Promise.all([
    prisma.leadActivity.findMany({
      where: { leadId: { in: leadIds } },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: {
        id: true,
        leadId: true,
        type: true,
        body: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.leadNote.findMany({
      where: { leadId: { in: leadIds } },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: {
        id: true,
        leadId: true,
        body: true,
        category: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
      },
    }),
    prisma.leadEmailLog.findMany({
      where: { leadId: { in: leadIds } },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: {
        id: true,
        leadId: true,
        subject: true,
        kind: true,
        sentById: true,
        createdAt: true,
        openedAt: true,
        clickedAt: true,
        sentBy: { select: { name: true, email: true } },
      },
    }),
    customerIds.length
      ? prisma.activityEvent.findMany({
          where: {
            userId: { in: customerIds },
            type: {
              in: [
                "LISTING_VIEW",
                "SAVE_LISTING",
                "UNSAVE_LISTING",
                "SAVE_SEARCH",
                "SEARCH",
                "WATCH_PROPERTY",
                "WATCH_AREA",
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          take: perSource,
          select: {
            id: true,
            userId: true,
            type: true,
            title: true,
            mlsNumber: true,
            path: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.appointment.findMany({
      where: {
        OR: [
          { leadId: { in: leadIds } },
          ...(customerIds.length
            ? [{ customerId: { in: customerIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(perSource, 40),
      select: {
        id: true,
        leadId: true,
        customerId: true,
        type: true,
        status: true,
        listingMls: true,
        createdAt: true,
      },
    }),
  ]);

  const items: DeskActivityItem[] = [];

  for (const row of notes) {
    const lead = leadById.get(row.leadId);
    if (!lead) continue;
    const type = row.category === "CALL" ? "CALL_NOTE" : "NOTE";
    items.push({
      id: `note:${row.id}`,
      category: "notes",
      type,
      actorName: row.author.name?.trim() || row.author.email,
      action:
        row.category === "CALL" ? "logged a call note on" : "added a note on",
      leadId: lead.id,
      leadName: leadDisplayName(lead),
      detail: sanitizeDetail(row.body, 120),
      createdAt: row.createdAt.toISOString(),
    });
  }

  for (const row of emails) {
    const lead = leadById.get(row.leadId);
    if (!lead) continue;
    const kind = row.kind?.toUpperCase() ?? "EMAIL";
    const type = isPropertyAlertEmailKind(row.kind)
      ? "PROPERTY_ALERT_EMAIL"
      : kind === "SHORTLIST" || kind === "SHORTLIST_EMAILED"
        ? "SHORTLIST_EMAILED"
        : kind === "DIGEST" || kind === "SAVED_SEARCH_DIGEST"
          ? "DIGEST_EMAIL"
          : "EMAIL";
    const actor =
      row.sentBy?.name?.trim() ||
      row.sentBy?.email ||
      (row.sentById == null ? "Houzzat" : null);
    items.push({
      id: `email:${row.id}`,
      category: "communications",
      type,
      actorName: actor,
      action: "sent a message to",
      leadId: lead.id,
      leadName: leadDisplayName(lead),
      detail: sanitizeDetail(row.subject, 90),
      createdAt: row.createdAt.toISOString(),
    });
    if (row.openedAt) {
      items.push({
        id: `email-open:${row.id}`,
        category: "communications",
        type: "EMAIL_OPENED",
        actorName: leadDisplayName(lead),
        action: "opened",
        leadId: lead.id,
        leadName: leadDisplayName(lead),
        detail: sanitizeDetail(row.subject, 90),
        createdAt: row.openedAt.toISOString(),
      });
    }
    if (row.clickedAt) {
      items.push({
        id: `email-click:${row.id}`,
        category: "communications",
        type: "EMAIL_CLICKED",
        actorName: leadDisplayName(lead),
        action: "clicked through",
        leadId: lead.id,
        leadName: leadDisplayName(lead),
        detail: sanitizeDetail(row.subject, 90),
        createdAt: row.clickedAt.toISOString(),
      });
    }
  }

  for (const row of events) {
    if (!row.userId) continue;
    const lead = customerToLead.get(row.userId);
    if (!lead) continue;
    const type = row.type;
    const cat = categoryForType(type);
    const action =
      type === "LISTING_VIEW"
        ? "viewed a property"
        : type === "SAVE_LISTING"
          ? "favorited a property"
          : type === "UNSAVE_LISTING"
            ? "unfavorited a property"
            : type === "SAVE_SEARCH"
              ? "saved a search"
              : type === "SEARCH"
                ? "ran a search"
                : type.startsWith("WATCH")
                  ? "set a watch"
                  : "was active on";
    items.push({
      id: `event:${row.id}`,
      category: cat === "notes" ? "views_favorites" : cat,
      type,
      actorName: leadDisplayName(lead),
      action,
      leadId: lead.id,
      leadName: leadDisplayName(lead),
      detail: sanitizeDetail(
        row.title?.trim() ||
          (row.mlsNumber ? `MLS® ${row.mlsNumber}` : null),
        90,
      ),
      createdAt: row.createdAt.toISOString(),
    });
  }

  for (const row of appointments) {
    const lead =
      (row.leadId ? leadById.get(row.leadId) : null) ??
      (row.customerId ? customerToLead.get(row.customerId) : null);
    if (!lead) continue;
    items.push({
      id: `appt:${row.id}`,
      category: "agent_actions",
      type: "APPOINTMENT",
      actorName: leadDisplayName(lead),
      action:
        row.status === "REQUESTED"
          ? "requested an appointment"
          : "has an appointment",
      leadId: lead.id,
      leadName: leadDisplayName(lead),
      detail: row.listingMls ? `MLS® ${row.listingMls}` : row.type,
      createdAt: row.createdAt.toISOString(),
    });
  }

  for (const row of activities) {
    // Notes & emails already covered by dedicated tables when body is redundant.
    const t = row.type.toLowerCase();
    if (t === "note" || t === "note_pin" || t === "email_sent") continue;
    const lead = leadById.get(row.leadId);
    if (!lead) continue;
    const type = row.type;
    const cat = categoryForType(type);
    items.push({
      id: `activity:${row.id}`,
      category: cat,
      type,
      actorName:
        row.user?.name?.trim() ||
        row.user?.email ||
        null,
      action: actionForLeadActivity(row.type, row.body),
      leadId: lead.id,
      leadName: leadDisplayName(lead),
      detail: sanitizeDetail(row.body, 120),
      createdAt: row.createdAt.toISOString(),
    });
  }

  items.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const filtered =
    category === "all"
      ? items
      : items.filter((item) => item.category === category);

  return filtered.slice(0, take);
}

export function isDeskActivityCategory(
  value: string,
): value is DeskActivityCategory {
  return (DESK_ACTIVITY_CATEGORIES as readonly string[]).includes(value);
}
