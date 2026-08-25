import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { openLeadProfileHref } from "@/lib/agent/lead-profile-query";
import { readActiveWorkspaceIdFromCookies } from "@/lib/active-workspace";
import { resolveOpenLeadHandoff } from "@/lib/open-lead-handoff";
import { prisma } from "@/lib/prisma";
import { isAgentRole } from "@/lib/roles";

/**
 * Stage 3I.1 — server-validated lead deep-link handoff (read-only page).
 *
 * Cookie writes are illegal in Server Components and throw at runtime
 * (Agent error boundary). Same-workspace / no-cookie paths either:
 * - redirect straight to the desk when the cookie is already correct, or
 * - redirect to GET /api/agent/open-lead/{id} which sets the cookie.
 *
 * Cross-workspace confirm → POST the same Route Handler.
 */
export default async function OpenLeadHandoffPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
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

  const cookieWorkspaceId = await readActiveWorkspaceIdFromCookies();
  const handoff = await resolveOpenLeadHandoff({
    userId: user.id,
    leadId,
    cookieWorkspaceId,
  });
  if (!handoff.ok) {
    notFound();
  }

  if (!handoff.needsConfirm) {
    if (handoff.cookieAlreadyCorrect) {
      redirect(openLeadProfileHref(handoff.leadId));
    }
    // Cookie missing/stale — Route Handler is the only legal mutation context.
    redirect(`/api/agent/open-lead/${encodeURIComponent(handoff.leadId)}`);
  }

  const validCookieWorkspaceId =
    handoff.cookieWorkspaceId &&
    handoff.activeMemberWorkspaceIds.includes(handoff.cookieWorkspaceId)
      ? handoff.cookieWorkspaceId
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
        <strong className="text-ink">{handoff.workspaceName}</strong>
        {currentName ? (
          <>
            . You are currently in{" "}
            <strong className="text-ink">{currentName}</strong>
          </>
        ) : null}
        . Continue to open the exact lead profile in that Workspace.
      </p>
      <form
        action={`/api/agent/open-lead/${encodeURIComponent(handoff.leadId)}`}
        method="post"
      >
        <button
          type="submit"
          className="w-full rounded-lg bg-canopy px-4 py-2.5 text-sm font-semibold text-white"
        >
          Open lead in {handoff.workspaceName}
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
