import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContext } from "@/lib/agent";
import { loadBuyerIntent } from "@/lib/agent/buyer-intent";
import {
  buyerIntentSearchName,
  buyerIntentToSavedQuery,
  hasUsableSearchCriteria,
} from "@/lib/agent/intent-to-search";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  leadId: z.string().min(1),
  searchId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  emailAlerts: z.boolean().optional(),
  smsAlerts: z.boolean().optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

const createSchema = z.object({
  leadId: z.string().min(1),
  /** When true, build query from Looking for / browsing signals. */
  fromIntent: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  emailAlerts: z.boolean().optional(),
  smsAlerts: z.boolean().optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  /** Update existing search id instead of creating. */
  searchId: z.string().min(1).optional(),
});

export async function PATCH(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
  });
  if (!lead?.customerId || !canAccessLead(ctx, lead)) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const search = await prisma.savedSearch.findFirst({
    where: { id: parsed.data.searchId, userId: lead.customerId },
  });
  if (!search) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  const updated = await prisma.savedSearch.update({
    where: { id: search.id },
    data: {
      name: parsed.data.name,
      emailAlerts: parsed.data.emailAlerts,
      smsAlerts: parsed.data.smsAlerts,
      query: parsed.data.query as object | undefined,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "search_criteria_updated",
      body: `Updated saved search “${updated.name}”`,
    },
  });

  return NextResponse.json({ ok: true, search: updated });
}

export async function POST(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    include: {
      customer: { select: { id: true, name: true } },
    },
  });
  if (!lead?.customerId || !canAccessLead(ctx, lead)) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  let query = parsed.data.query;
  let name = parsed.data.name;

  if (parsed.data.fromIntent || !query) {
    const existing = await prisma.savedSearch.findMany({
      where: { userId: lead.customerId },
      select: { name: true, query: true },
      take: 10,
      orderBy: { updatedAt: "desc" },
    });
    const intent = await loadBuyerIntent({
      customerId: lead.customerId,
      customerName: lead.customer?.name,
      savedSearches: existing,
    });
    if (!hasUsableSearchCriteria(intent.criteria)) {
      return NextResponse.json(
        { error: "Not enough Looking for signal to build a search yet." },
        { status: 400 },
      );
    }
    query = buyerIntentToSavedQuery(intent.criteria);
    name = name || buyerIntentSearchName(intent.criteria);
  }

  if (!query || Object.keys(query).length === 0) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  if (parsed.data.searchId) {
    const existing = await prisma.savedSearch.findFirst({
      where: { id: parsed.data.searchId, userId: lead.customerId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }
    const updated = await prisma.savedSearch.update({
      where: { id: existing.id },
      data: {
        name: name ?? existing.name,
        query: query as object,
        emailAlerts: parsed.data.emailAlerts ?? existing.emailAlerts,
        smsAlerts: parsed.data.smsAlerts ?? existing.smsAlerts,
      },
    });
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: ctx.user.id,
        type: "search_criteria_updated",
        body: `Synced saved search “${updated.name}” from Looking for`,
      },
    });
    return NextResponse.json({ ok: true, search: updated, created: false });
  }

  const created = await prisma.savedSearch.create({
    data: {
      userId: lead.customerId,
      name: name || "Looking for search",
      query: query as object,
      emailAlerts: parsed.data.emailAlerts ?? true,
      smsAlerts: parsed.data.smsAlerts ?? false,
      isPrimary: true,
    },
  });

  await prisma.savedSearch.updateMany({
    where: {
      userId: lead.customerId,
      id: { not: created.id },
      isPrimary: true,
    },
    data: { isPrimary: false },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "search_criteria_created",
      body: `Created saved search “${created.name}” from Looking for`,
    },
  });

  return NextResponse.json({ ok: true, search: created, created: true });
}
