import { cookies } from "next/headers";
import { Suspense } from "react";
import { TeamLeaderDeskBanner } from "@/components/agent/TeamLeaderDeskBanner";
import { DESK_AGENT_COOKIE, resolveDeskView } from "@/lib/agent/brokerage";
import { requireAgentContext } from "@/lib/agent";

function BannerSkeleton() {
  return (
    <div
      className="mb-3 h-[3.25rem] animate-pulse rounded-xl bg-[#2b6cb0]/10 sm:mb-4"
      aria-busy="true"
      aria-label="Loading desk banner"
    />
  );
}

async function TeamLeaderBannerBody() {
  const deskCookie =
    (await cookies()).get(DESK_AGENT_COOKIE)?.value ?? null;
  const ctx = await requireAgentContext();
  if (!ctx?.isPlatformAdmin) return null;

  const desk = await resolveDeskView({ ...ctx, deskCookie });
  return <TeamLeaderDeskBanner deskLabel={desk.deskLabel} />;
}

/** Streams Team Leader desk banner after AgentShell paints. */
export function AgentDeferredLeaderBanner() {
  return (
    <Suspense fallback={<BannerSkeleton />}>
      <TeamLeaderBannerBody />
    </Suspense>
  );
}
