import Image from "next/image";
import type { Metadata } from "next";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import {
  PLATFORM_SUSPENDED_DOCUMENT_TITLE,
  PLATFORM_SUSPENDED_PAGE_TITLE,
  PLATFORM_SUSPENDED_PRIMARY_MESSAGE,
  PLATFORM_SUSPENDED_SECONDARY_MESSAGE,
  PLATFORM_SUSPENDED_SUPPORT_PROMPT,
  resolveHouzzatProSupportCta,
} from "@/lib/platform/status";

export const platformSuspendedPageMetadata: Metadata = {
  title: PLATFORM_SUSPENDED_DOCUMENT_TITLE,
  robots: { index: false, follow: false },
};

export function PlatformSuspendedPage() {
  const supportCta = resolveHouzzatProSupportCta();

  return (
    <div className="flex min-h-dvh flex-col bg-[#f8fafc] text-slate-900">
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.28)] sm:p-10">
          <div className="flex flex-col items-center text-center">
            <Image
              src="/images/houzzat-pro-mark.png"
              alt={PLATFORM_PRODUCT_NAME}
              width={168}
              height={40}
              className="h-9 w-auto"
              priority
            />

            <div
              className="mt-8 flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                className="size-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M10 9v6M14 9v6" strokeLinecap="round" />
              </svg>
            </div>

            <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {PLATFORM_SUSPENDED_PAGE_TITLE}
            </h1>

            <p className="mt-4 text-base leading-relaxed text-slate-600">
              {PLATFORM_SUSPENDED_PRIMARY_MESSAGE}
            </p>

            <p className="mt-3 text-base leading-relaxed text-slate-700">
              {PLATFORM_SUSPENDED_SUPPORT_PROMPT}
            </p>

            <a
              href={supportCta.href}
              className="mt-8 inline-flex items-center justify-center rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              {supportCta.label}
            </a>

            <p className="mt-6 text-sm leading-relaxed text-slate-500">
              {PLATFORM_SUSPENDED_SECONDARY_MESSAGE}
            </p>
          </div>
        </div>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-slate-400">
        {PLATFORM_PRODUCT_NAME} platform status
      </footer>
    </div>
  );
}
