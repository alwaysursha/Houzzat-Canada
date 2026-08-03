import Link from "next/link";

/** Shown only to Team Leaders while inspecting the CRM desk. */
export function TeamLeaderDeskBanner({ deskLabel }: { deskLabel: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2b6cb0]/25 bg-[#2b6cb0]/8 px-3 py-2 text-[13px] text-[#1e2a38]">
      <p>
        <span className="font-semibold">Team Leader view</span>
        <span className="text-ink/50"> · </span>
        Viewing <span className="font-semibold">{deskLabel}</span>
      </p>
      <Link
        href="/admin"
        className="font-semibold text-[#2b6cb0] underline-offset-2 hover:underline"
      >
        Change desk in Admin HQ
      </Link>
    </div>
  );
}
