import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveMarketingCanonicalOrigin } from "@/lib/tenancy/marketing-page-metadata";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = await prisma.landingPage.findUnique({ where: { slug } });
  return { title: page?.title ?? "Landing" };
}

export default async function LandingPublicPage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const page = await prisma.landingPage.findUnique({ where: { slug } });
  if (!page || !page.published) notFound();

  const utmSource =
    typeof query.utm_source === "string" ? query.utm_source : null;

  const canonicalOrigin =
    (await resolveMarketingCanonicalOrigin()) ?? "https://example.invalid";

  const ctaHref = (() => {
    const base = page.ctaHref || "/home-valuation";
    const url = new URL(base, canonicalOrigin.endsWith("/") ? canonicalOrigin : `${canonicalOrigin}/`);
    if (page.utmCampaign) url.searchParams.set("utm_campaign", page.utmCampaign);
    if (utmSource) url.searchParams.set("utm_source", utmSource);
    return `${url.pathname}${url.search}`;
  })();

  return (
    <div>
      <section
        className="relative min-h-[70vh] bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(120deg, rgb(20 32 28 / 0.82), rgb(var(--tenant-primary-rgb) / 0.45)), url('${
            page.heroImageUrl ||
            "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=2000&q=80"
          }')`,
        }}
      >
        <div className="relative mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6">
          {page.areaFocus ? (
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">
              {page.areaFocus}
            </p>
          ) : null}
          <h1 className="mt-3 font-display text-5xl text-white sm:text-6xl">
            {page.headline || page.title}
          </h1>
          {page.subtitle ? (
            <p className="mt-4 max-w-xl text-lg text-white/85">{page.subtitle}</p>
          ) : null}
          <Link
            href={ctaHref}
            className="mt-8 inline-flex w-fit rounded-lg bg-white px-5 py-3 text-sm font-semibold text-canopy-deep"
          >
            {page.ctaLabel || "Get started"}
          </Link>
        </div>
      </section>
    </div>
  );
}
