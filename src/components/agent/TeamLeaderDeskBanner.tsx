import { StaffHardLink } from "@/components/site/StaffHardLink";

/** Shown only to Team Leaders while inspecting the CRM desk. */
export function TeamLeaderDeskBanner({ deskLabel }: { deskLabel: string }) {
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-[#2b6cb0]/25 bg-[#2b6cb0]/8 px-3 py-2.5 text-[13px] text-[#1e2a38] sm:mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:rounded-lg sm:py-2">
      <p>
        <span className="font-semibold">Team Leader view</span>
        <span className="text-ink/50"> · </span>
        Viewing <span className="font-semibold">{deskLabel}</span>
      </p>
      <StaffHardLink
        href="/admin"
        className="font-semibold text-[#2b6cb0] underline-offset-2 hover:underline"
      >
        Change desk in Admin HQ
      </StaffHardLink>
    </div>
  );
}
