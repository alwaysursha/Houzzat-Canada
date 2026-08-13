import { cookies } from "next/headers";
import { Suspense } from "react";
import { AdminDeskPicker } from "@/components/admin/AdminDeskPicker";
import {
  DESK_AGENT_COOKIE,
  ensureBrokerageOrganization,
  resolveDeskView,
} from "@/lib/agent/brokerage";

function DeskPickerSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "px-0" : "px-1"}
      aria-busy="true"
      aria-label="Loading desk picker"
    >
      {!compact ? (
        <div className="mb-1.5 h-2.5 w-24 animate-pulse rounded bg-ink/10" />
      ) : null}
      <div
        className={
          compact
            ? "h-9 w-full animate-pulse rounded-lg bg-ink/10"
            : "h-10 w-full animate-pulse rounded-lg bg-ink/10"
        }
      />
    </div>
  );
}

async function AdminDeskPickerBody({
  userId,
  compact,
}: {
  userId: string;
  compact?: boolean;
}) {
  const deskCookie =
    (await cookies()).get(DESK_AGENT_COOKIE)?.value ?? null;

  try {
    const brokerage = await ensureBrokerageOrganization();
    const desk = await resolveDeskView({
      user: { id: userId },
      organizationId: brokerage.id,
      canSeeTeamLeads: true,
      deskCookie,
    });
    if (desk.teamAgents.length === 0) return null;
    return (
      <AdminDeskPicker
        key={`${compact ? "c" : "f"}-${desk.deskAgentId ?? "all"}`}
        agents={desk.teamAgents}
        selectedAgentId={desk.deskAgentId}
        compact={compact}
      />
    );
  } catch (error) {
    console.error("[admin] deferred desk picker failed", error);
    return null;
  }
}

/** Streams desk picker after AdminShell paints (brokerage / team list). */
export function AdminDeferredDeskPicker({
  userId,
  compact = false,
}: {
  userId: string;
  compact?: boolean;
}) {
  return (
    <Suspense fallback={<DeskPickerSkeleton compact={compact} />}>
      <AdminDeskPickerBody userId={userId} compact={compact} />
    </Suspense>
  );
}
