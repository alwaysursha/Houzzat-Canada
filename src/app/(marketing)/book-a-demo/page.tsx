import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { BookDemoForm } from "@/components/platform/public/BookDemoForm";
import { BookDemoProductVisual } from "@/components/platform/public/BookDemoProductVisual";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import {
  BOOK_DEMO_DOCUMENT_TITLE,
  BOOK_DEMO_EYEBROW,
  BOOK_DEMO_HERO_LEAD,
  BOOK_DEMO_HERO_SUPPORT,
  BOOK_DEMO_HERO_TITLE_LINE_1,
  BOOK_DEMO_HERO_TITLE_LINE_2,
  BOOK_DEMO_VALUE_GROUPS,
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
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-center">
        <p className="max-w-md text-sm leading-relaxed text-slate-300">
          Book a Demo is temporarily unavailable. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="book-demo-page min-h-dvh overflow-x-hidden bg-[#f7f8f7] text-slate-900">
      <div className="mx-auto grid min-h-dvh lg:grid-cols-2">
        {/* LEFT — sales story */}
        <aside className="relative flex flex-col justify-between overflow-hidden bg-[#07111f] px-5 py-8 text-white sm:px-8 sm:py-10 lg:px-12 lg:py-12 xl:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.16),_transparent_42%),radial-gradient(ellipse_at_bottom_right,_rgba(15,23,42,0.9),_transparent_55%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent max-lg:hidden"
          />

          <div className="relative z-10">
            <HouzzatProWordmark size="lg" className="text-white" />

            <p className="mt-8 text-[11px] font-semibold tracking-[0.2em] text-emerald-300/90 uppercase sm:mt-10">
              {BOOK_DEMO_EYEBROW}
            </p>

            <h1 className="mt-4 font-display text-[2.15rem] leading-[1.08] font-semibold tracking-tight text-white sm:text-5xl lg:text-[3.15rem] lg:leading-[1.05]">
              <span className="block">{BOOK_DEMO_HERO_TITLE_LINE_1}</span>
              <span className="mt-1 block text-emerald-200/95">
                {BOOK_DEMO_HERO_TITLE_LINE_2}
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300 sm:text-base">
              {BOOK_DEMO_HERO_LEAD}
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-[15px]">
              {BOOK_DEMO_HERO_SUPPORT}
            </p>

            <BookDemoProductVisual />

            <div className="mt-8 grid gap-5 border-t border-white/10 pt-7 sm:grid-cols-3 sm:gap-4">
              {BOOK_DEMO_VALUE_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="text-[10px] font-semibold tracking-[0.16em] text-emerald-300/80 uppercase">
                    {group.title}
                  </p>
                  <ul className="mt-2.5 space-y-1.5">
                    {group.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-[12px] leading-snug text-slate-300"
                      >
                        <span
                          aria-hidden
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <p className="relative z-10 mt-10 text-[11px] tracking-wide text-slate-500 lg:mt-12">
            {PLATFORM_PRODUCT_NAME} · sales-assisted onboarding
          </p>
        </aside>

        {/* RIGHT — form */}
        <main className="relative flex items-center bg-[#f4f6f5] px-4 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14 xl:px-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.06),_transparent_45%)]"
          />
          <div className="relative z-10 mx-auto w-full max-w-[34rem]">
            <div className="rounded-[1.35rem] border border-slate-200/90 bg-white p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] sm:p-8 lg:p-9">
              <BookDemoForm turnstileSiteKey={turnstileSiteKey} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
