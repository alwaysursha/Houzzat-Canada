import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { openLeadProfileHref } from "@/lib/agent/lead-profile-query";
import {
  ACTIVE_WORKSPACE_COOKIE,
  activeWorkspaceCookieOptions,
  readActiveWorkspaceIdFromCookies,
  signActiveWorkspaceId,
} from "@/lib/active-workspace";
import { shouldConfirmWorkspaceSwitch } from "@/lib/open-lead-workspace-switch";
import { prisma } from "@/lib/prisma";
import { isAgentRole } from "@/lib/roles";

/**
 * Stage 3I.1 — server-validated lead deep-link handoff.
 *
 * Confirm ONLY for true cross-workspace switch (valid A cookie → lead in B).
 * Single membership + missing/stale cookie → direct open (matches staff context).
 */
export default async function OpenLeadHandoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ confirm?: string }>;
}) {
  const { leadId } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(await staffSignInRedirectUrl(`/agent/open-lead/${leadId}`));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!user || user.disabledAt || !isAgentRole(user.role)) {
    notFound();
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      workspaceId: true,
      workspace: { select: { id: true, name: true, status: true } },
    },
  });
  if (!lead?.workspaceId || lead.workspace?.status !== "ACTIVE") {
    notFound();
  }

  const activeMemberships = await prisma.workspaceMember.findMany({
    where: {
      userId: user.id,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { workspaceId: true },
  });
  const activeMemberWorkspaceIds = activeMemberships.map((m) => m.workspaceId);
  if (!activeMemberWorkspaceIds.includes(lead.workspaceId)) {
    notFound();
  }

  const cookieWorkspaceId = await readActiveWorkspaceIdFromCookies();
  const needsConfirm = shouldConfirmWorkspaceSwitch({
    leadWorkspaceId: lead.workspaceId,
    cookieWorkspaceId,
    activeMemberWorkspaceIds,
  });

  if (!needsConfirm || sp.confirm === "1") {
    const cookieStore = await cookies();
    cookieStore.set(
      ACTIVE_WORKSPACE_COOKIE,
      signActiveWorkspaceId(lead.workspaceId),
      activeWorkspaceCookieOptions(),
    );
    redirect(openLeadProfileHref(lead.id));
  }

  const validCookieWorkspaceId =
    cookieWorkspaceId && activeMemberWorkspaceIds.includes(cookieWorkspaceId)
      ? cookieWorkspaceId
      : null;
  const currentName = validCookieWorkspaceId
    ? (
        await prisma.workspace.findUnique({
          where: { id: validCookieWorkspaceId },
          select: { name: true },
        })
      )?.name
    : null;

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4 px-4 py-12">
      <h1 className="font-display text-3xl text-ink">Switch Workspace?</h1>
      <p className="text-sm leading-relaxed text-ink/65">
        This lead belongs to{" "}
        <strong className="text-ink">{lead.workspace.name}</strong>
        {currentName ? (
          <>
            . You are currently in{" "}
            <strong className="text-ink">{currentName}</strong>
          </>
        ) : null}
        . Continue to open the exact lead profile in that Workspace.
      </p>
      <form
        action={`/api/agent/open-lead/${encodeURIComponent(lead.id)}`}
        method="post"
      >
        <button
          type="submit"
          className="w-full rounded-lg bg-canopy px-4 py-2.5 text-sm font-semibold text-white"
        >
          Open lead in {lead.workspace.name}
        </button>
      </form>
      <Link
        href="/agent"
        className="text-center text-sm font-medium text-ink/55 underline-offset-2 hover:underline"
      >
        Cancel
      </Link>
    </div>
  );
}
