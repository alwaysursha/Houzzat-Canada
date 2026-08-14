import Link from "next/link";
import { Building2 } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";

/**
 * Shown inside HouzzatPro when the signed-in role is not ADMIN/AGENT.
 * Does not grant access — server role checks still deny /admin and /agent.
 */
export function HouzzatProStaffOnly() {
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col justify-center px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-canopy/15 text-canopy">
          <Building2 className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">
          HouzzatPro is for agents and administrators
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink/70">
          This account does not have staff access. Use the Houzzat app or
          houzzat.com to browse homes and manage your buyer or seller account.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-lg bg-canopy px-5 text-base font-semibold text-white hover:bg-canopy-deep"
        >
          Continue on Houzzat
        </Link>
        <div className="mt-4">
          <SignOutButton className="text-sm text-ink/60 underline-offset-2 hover:underline" />
        </div>
      </div>
    </main>
  );
}
