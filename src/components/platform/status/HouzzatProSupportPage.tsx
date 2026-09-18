import type { Metadata } from "next";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import {
  HOUZZATPRO_SUPPORT_DOCUMENT_TITLE,
  HOUZZATPRO_SUPPORT_PAGE_EMAIL,
  HOUZZATPRO_SUPPORT_PAGE_EMAIL_HREF,
  HOUZZATPRO_SUPPORT_PAGE_EMAIL_LABEL,
  HOUZZATPRO_SUPPORT_PAGE_INTRO,
  HOUZZATPRO_SUPPORT_PAGE_RESPONSE_TIME,
  HOUZZATPRO_SUPPORT_PAGE_TITLE,
} from "@/lib/platform/status/support-copy";

export const houzzatProSupportPageMetadata: Metadata = {
  title: HOUZZATPRO_SUPPORT_DOCUMENT_TITLE,
  robots: { index: false, follow: false },
};

export function HouzzatProSupportPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#f8fafc] text-slate-900">
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.28)] sm:p-10">
          <div className="flex flex-col items-center text-center">
            <HouzzatProWordmark size="lg" className="text-ink" />

            <h1 className="mt-8 font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {HOUZZATPRO_SUPPORT_PAGE_TITLE}
            </h1>

            <p className="mt-4 text-base leading-relaxed text-slate-600">
              {HOUZZATPRO_SUPPORT_PAGE_INTRO}
            </p>

            <div className="mt-6 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
              <p className="font-medium text-slate-900">
                {HOUZZATPRO_SUPPORT_PAGE_EMAIL_LABEL}
              </p>
              <a
                href={HOUZZATPRO_SUPPORT_PAGE_EMAIL_HREF}
                className="mt-1 inline-block text-slate-900 underline underline-offset-2"
              >
                {HOUZZATPRO_SUPPORT_PAGE_EMAIL}
              </a>
              <p className="mt-2">{HOUZZATPRO_SUPPORT_PAGE_RESPONSE_TIME}</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-slate-400">
        {PLATFORM_PRODUCT_NAME} platform support
      </footer>
    </div>
  );
}
