import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { BookDemoForm } from "@/components/platform/public/BookDemoForm";
import { BookDemoProductVisual } from "@/components/platform/public/BookDemoProductVisual";
import { PublicSiteFrame } from "@/components/platform/public/site/PublicSiteFrame";
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
    alternates: { canonical: "https://houzzatpro.com/book-a-demo" },
    openGraph: {
      title: BOOK_DEMO_DOCUMENT_TITLE,
      url: "https://houzzatpro.com/book-a-demo",
      siteName: "HouzzatPRO",
      type: "website",
    },
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
    <PublicSiteFrame pathname="/book-a-demo">
    <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-6 py-8 lg:grid-cols-2 lg:py-12">
        <aside className="hp-pub-hero">
          <HouzzatProWordmark size="md" className="text-[1.45rem]" />
          <p className="hp-pub-kicker">{BOOK_DEMO_EYEBROW}</p>
          <h1>
            <span className="block">{BOOK_DEMO_HERO_TITLE_LINE_1}</span>
            <span className="mt-1 block text-[#087052]">{BOOK_DEMO_HERO_TITLE_LINE_2}</span>
          </h1>
          <p className="hp-pub-lead">{BOOK_DEMO_HERO_LEAD}</p>
          <p className="hp-pub-lead">{BOOK_DEMO_HERO_SUPPORT}</p>
          <BookDemoProductVisual />
          <div className="mt-6 grid gap-4">
            {BOOK_DEMO_VALUE_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="hp-pub-kicker">{group.title}</p>
                <ul className="mt-2 space-y-1">
                  {group.items.map((item) => (
                    <li key={item} className="text-sm text-[#273d37]">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-[#4d655c]">{PLATFORM_PRODUCT_NAME} · sales-assisted onboarding</p>
        </aside>
        <div className="rounded-3xl border border-[#d7e4dc] bg-white p-5 shadow-[0_24px_60px_rgba(16,40,32,0.08)] sm:p-8">
          <BookDemoForm turnstileSiteKey={turnstileSiteKey} />
        </div>
    </div>
    </PublicSiteFrame>
  );
}
