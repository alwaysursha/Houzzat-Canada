import { Suspense } from "react";
import type { Metadata } from "next";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { HomeValuationForm } from "@/components/valuation/HomeValuationForm";
import { ValuationFaqSection } from "@/components/valuation/ValuationFaqSection";
import {
  ESTIMATOR_FAQS,
  SELLING_FAQS,
} from "@/components/valuation/valuation-faqs";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { resolveMarketingPresentationBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { absoluteUrlForOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";

const PAGE_TITLE = "What's Your Home Worth? Free Home Value Estimate";
const PAGE_DESCRIPTION =
  "Enter your address for a free home value estimate based on local Ontario market data. See a personalized range, recent nearby sales context, and optional Market Pulse updates.";

export async function generateMetadata(): Promise<Metadata> {
  return buildMarketingPageMetadata({
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    path: "/home-valuation",
  });
}

function faqJsonLd(input: {
  siteName: string;
  pageUrl: string;
  siteUrl: string;
}) {
  const entities = [...ESTIMATOR_FAQS, ...SELLING_FAQS].map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        url: input.pageUrl,
        name: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        isPartOf: {
          "@type": "WebSite",
          name: input.siteName,
          url: input.siteUrl,
        },
      },
      {
        "@type": "WebApplication",
        name: `${input.siteName} Home Value Estimate`,
        url: input.pageUrl,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
        description: PAGE_DESCRIPTION,
      },
      { "@type": "FAQPage", mainEntity: entities },
    ],
  };
}

export default async function HomeValuationPage() {
  const brand = await resolveMarketingPresentationBrand();
  const siteName = brand?.displayName ?? "Real Estate";
  const siteUrl =
    brand?.canonicalOrigin ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    "http://127.0.0.1:3000";
  const pageUrl =
    absoluteUrlForOrigin(siteUrl, "/home-valuation") ??
    `${siteUrl.replace(/\/$/, "")}/home-valuation`;

  return (
    <div className="pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            faqJsonLd({ siteName, pageUrl, siteUrl: siteUrl.replace(/\/$/, "") }),
          ),
        }}
      />

      <section className="relative overflow-hidden border-b border-line/60">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(1200px 600px at 10% -20%, rgb(var(--tenant-primary-rgb) / 0.14), transparent 55%), radial-gradient(900px 500px at 100% 0%, rgb(var(--tenant-accent-rgb) / 0.1), transparent 50%), linear-gradient(180deg, var(--mist) 0%, var(--surface) 100%)",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-16">
          <p className="text-center font-display text-3xl tracking-tight text-canopy sm:text-4xl">
            {siteName}
          </p>
          <h1 className="mt-4 text-center font-display text-3xl leading-tight tracking-tight text-ink sm:text-5xl">
            What&apos;s your home worth?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-base text-ink/65 sm:text-lg">
            Thinking of selling—or just curious? Enter your address for a free
            estimate based on local market activity.
          </p>

          <div className="mx-auto mt-10 rounded-2xl border border-line/80 bg-white/90 p-5 shadow-[0_20px_50px_-28px_rgba(20,32,28,0.35)] backdrop-blur-sm sm:p-8">
            <Suspense
              fallback={
                <div className="py-10 text-center text-sm text-ink/50">
                  Loading…
                </div>
              }
            >
              <HomeValuationForm />
            </Suspense>
          </div>

          <p className="mx-auto mt-5 max-w-lg text-center text-xs leading-relaxed text-ink/45">
            Stay in the know in under a minute. Your estimate uses {siteName}{" "}
            inventory and is not a formal appraisal.
          </p>
        </div>
      </section>

      <section
        id="how-we-estimate"
        className="mx-auto max-w-5xl px-4 py-14 sm:px-6"
      >
        <h2 className="text-center font-display text-2xl tracking-tight text-ink sm:text-3xl">
          What you get
        </h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {[
            {
              title: "An accurate starting range",
              body: "A personalized report estimate based on market data and nearby trends.",
            },
            {
              title: "Recently sold context",
              body: "Understand what similar homes in your neighbourhood have sold for.",
            },
            {
              title: "Neighbourhood Pulse",
              body: "Optional updates so you stay on top of sales activity around your home.",
            },
          ].map((item) => (
            <div key={item.title} className="text-center sm:text-left">
              <h3 className="text-lg font-bold text-ink">{item.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/65">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-12 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:gap-14">
        <ValuationFaqSection
          title="About the home value estimate"
          items={[...ESTIMATOR_FAQS]}
        />
        <ValuationFaqSection
          title="About selling your home"
          items={[...SELLING_FAQS]}
        />
      </div>

      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-4 sm:px-6">
        <p className="text-sm leading-relaxed text-ink/50">
          Estimates may be incomplete or change as the market moves. This is not
          a substitute for a professional appraisal or advice from a licensed
          real estate professional.
        </p>
        <MlsDisclaimer />
      </div>
    </div>
  );
}
