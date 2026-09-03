import Link from "next/link";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";

export default function PlatformAccessDeniedPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0f172a] px-4 text-slate-100">
      <div className="max-w-md rounded-xl border border-slate-800 bg-[#111827] p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
          {PLATFORM_PRODUCT_NAME}
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold text-white">
          Platform access denied
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          Master Admin platform operator access is required. Tenant admin or agent
          credentials cannot open the HouzzatPRO control plane.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/pro/sign-in?callbackUrl=/platform"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Sign in
          </Link>
          <Link
            href="/pro"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Back to HouzzatPRO
          </Link>
        </div>
      </div>
    </div>
  );
}
