import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookDemoForm } from "@/components/platform/public/BookDemoForm";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import {
  BOOK_DEMO_DOCUMENT_TITLE,
  BOOK_DEMO_PAGE_INTRO,
  BOOK_DEMO_PAGE_TITLE,
} from "@/lib/platform/public/book-demo-copy";
import { isHouzzatProPlatformBookDemoRequest } from "@/lib/platform/public/book-demo-request";
import { readTurnstileSiteKey } from "@/lib/platform/public/turnstile-verify";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isHouzzatProPlatformBookDemoRequest())) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  return {
    title: BOOK_DEMO_DOCUMENT_TITLE,
    robots: { index: true, follow: true },
  };
}

export default async function BookADemoPage() {
  if (!(await isHouzzatProPlatformBookDemoRequest())) {
    notFound();
  }

  const turnstileSiteKey = readTurnstileSiteKey();
  if (!turnstileSiteKey) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f4f7f5] px-4 text-center text-slate-700">
        <p className="max-w-md text-sm leading-relaxed">
          Book a Demo is temporarily unavailable. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#f4f7f5] text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(15,107,76,0.12),_transparent_55%),linear-gradient(180deg,#eef5f1_0%,#f8fafc_42%,#f4f7f5_100%)]"
      />
      <main className="relative mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
          <div className="mb-8">
            <Image
              src="/images/houzzat-pro-mark.png"
              alt={PLATFORM_PRODUCT_NAME}
              width={168}
              height={40}
              className="h-9 w-auto"
              priority
            />
            <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              {BOOK_DEMO_PAGE_TITLE}
            </h1>
            <p className="mt-3 max-w-prose text-base leading-relaxed text-slate-600">
              {BOOK_DEMO_PAGE_INTRO}
            </p>
          </div>
          <BookDemoForm turnstileSiteKey={turnstileSiteKey} />
        </div>
        <p className="mt-8 text-center text-xs text-slate-400">
          {PLATFORM_PRODUCT_NAME} · sales-assisted onboarding
        </p>
      </main>
    </div>
  );
}
