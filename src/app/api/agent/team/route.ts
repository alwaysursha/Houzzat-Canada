import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAgentContext,
  resolveOrganizationIdForAssignee,
} from "@/lib/agent";
import { SITE_URL } from "@/lib/constants";
import { sendRenderedEmail } from "@/lib/email/send";
import { renderTeamInviteEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "AGENT"]).default("AGENT"),
});

const reassignSchema = z.object({
  leadId: z.string().min(1),
  assigneeId: z.string().min(1).nullable(),
});

const inviteActionSchema = z.object({
  action: z.enum(["resend_invite", "cancel_invite"]),
  inviteId: z.string().min(1),
});

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

async function sendTeamInviteEmail(input: {
  to: string;
  orgName: string;
  role: string;
  token: string;
  invitedByName: string | null;
  expiresAt: Date;
  alreadyMember?: boolean;
}) {
  const rendered = renderTeamInviteEmail({
    orgName: input.orgName,
    role: input.role,
    inviteUrl: `${SITE_URL}/auth/invite/${input.token}`,
    invitedByName: input.invitedByName,
    alreadyMember: input.alreadyMember,
    expiresAt: input.expiresAt,
  });
  return sendRenderedEmail({
    to: input.to,
    rendered,
    stream: "notify",
  });
}

export async function GET() {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [members, invites, org] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            agentProfile: { select: { active: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizationInvite.findMany({
      where: {
        organizationId: ctx.organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
    }),
  ]);

  return NextResponse.json({
    organization: org,
    members,
    invites,
    canManage: ctx.canSeeTeamLeads,
  });
}

export async function POST(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ctx.canSeeTeamLeads) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await request.json();
  const actionRaw =
    typeof body === "object" && body !== null && "action" in body
      ? (body as { action?: unknown }).action
      : null;

  if (actionRaw === "resend_invite" || actionRaw === "cancel_invite") {
    const parsed = inviteActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invite action" }, { status: 400 });
    }

    const invite = await prisma.organizationInvite.findFirst({
      where: {
        id: parsed.data.inviteId,
        organizationId: ctx.organizationId,
      },
      include: { organization: { select: { name: true } } },
    });
    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (parsed.data.action === "cancel_invite") {
      await prisma.organizationInvite.delete({ where: { id: invite.id } });
      return NextResponse.json({ ok: true, cancelled: true });
    }

    if (invite.acceptedAt) {
      return NextResponse.json(
        { error: "Invite was already accepted" },
        { status: 400 },
      );
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const updated = await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { expiresAt },
    });

    const sendResult = await sendTeamInviteEmail({
      to: invite.email,
      orgName: invite.organization.name,
      role: invite.role,
      token: invite.token,
      invitedByName: ctx.user.name || ctx.user.email,
      expiresAt,
    });
    if (!sendResult.ok) {
      console.error("[team:invite] resend failed", invite.email, sendResult.error);
      return NextResponse.json(
        { error: "Could not resend invite email" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      resent: true,
      invite: updated,
      emailStatus: sendResult.status,
    });
  }

  if (actionRaw === "reassign") {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const parsed = reassignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: parsed.data.leadId },
    });
    if (!lead || lead.organizationId !== ctx.organizationId) {
      if (!ctx.isPlatformAdmin) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    if (parsed.data.assigneeId) {
      const member = await prisma.organizationMembership.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: parsed.data.assigneeId,
        },
      });
      if (!member && !ctx.isPlatformAdmin) {
        return NextResponse.json(
          { error: "Assignee not on team" },
          { status: 400 },
        );
      }
    }

    let organizationId = lead?.organizationId ?? ctx.organizationId;
    if (parsed.data.assigneeId) {
      organizationId =
        (await resolveOrganizationIdForAssignee(parsed.data.assigneeId)) ??
        organizationId;
    }

    const updated = await prisma.lead.update({
      where: { id: parsed.data.leadId },
      data: {
        assignedAgentId: parsed.data.assigneeId,
        organizationId,
        activities: {
          create: {
            type: "reassigned",
            userId: ctx.user.id,
            body: parsed.data.assigneeId
              ? `Reassigned to ${parsed.data.assigneeId}`
              : "Moved to pond",
          },
        },
      },
    });

    return NextResponse.json({ ok: true, lead: updated });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
  });
  const memberCount = await prisma.organizationMembership.count({
    where: { organizationId: org.id },
  });
  if (memberCount >= org.seatLimit) {
    return NextResponse.json(
      { error: `Seat limit reached (${org.seatLimit})` },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invite = await prisma.organizationInvite.create({
    data: {
      organizationId: org.id,
      email,
      role: parsed.data.role,
      invitedById: ctx.user.id,
      expiresAt,
    },
  });

  // Auto-accept if user already exists as AGENT / ADMIN.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  let alreadyMember = false;
  if (
    existingUser &&
    (existingUser.role === "AGENT" || existingUser.role === "ADMIN")
  ) {
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: existingUser.id,
        },
      },
      create: {
        organizationId: org.id,
        userId: existingUser.id,
        role: parsed.data.role,
      },
      update: { role: parsed.data.role },
    });
    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
    alreadyMember = true;
  }

  const sendResult = await sendTeamInviteEmail({
    to: email,
    orgName: org.name,
    role: parsed.data.role,
    token: invite.token,
    invitedByName: ctx.user.name || ctx.user.email,
    alreadyMember,
    expiresAt,
  });
  if (!sendResult.ok) {
    console.error("[team:invite] email failed", email, sendResult.error);
  }

  return NextResponse.json({
    ok: true,
    invite,
    alreadyMember,
    emailStatus: sendResult.status,
  });
}
