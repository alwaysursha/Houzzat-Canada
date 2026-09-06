import Link from "next/link";
import { AgentPublicContactLines } from "@/components/site/AgentPublicContact";
import type { AgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";

export function AgentSignatureContactSection({
  view,
}: {
  view: AgentSignatureView;
}) {
  const contactHref = view.email
    ? `mailto:${view.email}`
    : view.phone
      ? `tel:${view.phone}`
      : "/home-valuation";

  return (
    <section
      id="work-with-me"
      className="scroll-mt-28 relative overflow-hidden bg-canopy-deep px-4 py-20 text-surface sm:px-6 lg:px-10 lg:py-28"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/hero-canadian-homes.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-25"
      />
      <div className="absolute inset-0 bg-canopy-deep/75" />
      <div className="relative mx-auto max-w-3xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-surface/45">
          Let&apos;s talk
        </p>
        <h2 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
          Let&apos;s Make Your Next Move
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base text-surface/70">
          Buying, selling, or simply exploring your options? Start a
          conversation with {view.firstName}.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={contactHref}
            className="bg-surface px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-canopy-deep"
          >
            Let&apos;s Talk
          </Link>
          <Link
            href="/search"
            className="border border-surface/35 px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.16em]"
          >
            Browse listings
          </Link>
        </div>
        <AgentPublicContactLines
          cellPhone={view.phone}
          email={view.email}
          className="mt-8 text-sm text-surface/60"
          labelClassName="text-surface/45"
          linkClassName="hover:text-surface"
        />
      </div>
    </section>
  );
}
