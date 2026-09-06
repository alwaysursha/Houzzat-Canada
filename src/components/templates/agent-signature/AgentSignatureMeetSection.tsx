import Link from "next/link";
import type { AgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";

export function AgentSignatureMeetSection({
  view,
}: {
  view: AgentSignatureView;
}) {
  const initial = view.name.trim().charAt(0).toUpperCase() || "A";

  return (
    <section
      id="meet-the-agent"
      className="scroll-mt-28 bg-mist px-4 py-14 sm:px-6 lg:px-10 lg:py-20"
      data-as-section="meet-agent"
    >
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
        <div className="relative aspect-[4/5] overflow-hidden bg-line shadow-[0_30px_60px_-40px_rgba(0,0,0,0.45)]">
          {view.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.photoUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-top"
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-8xl text-ink/15">{initial}</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">
            About
          </p>
          <h2 className="mt-3 font-display text-4xl tracking-tight text-ink sm:text-5xl">
            Meet {view.firstName}
          </h2>
          {view.title || view.serviceArea ? (
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.12em] text-ink/55">
              {[view.title, view.serviceArea].filter(Boolean).join(" · ")}
            </p>
          ) : null}

          {view.bio ? (
            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink/70 whitespace-pre-line">
              {view.bio}
            </p>
          ) : (
            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink/70">
              {view.tagline}
            </p>
          )}

          {view.markets.length > 0 ? (
            <div className="mt-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                Areas served
              </p>
              <p className="mt-2 text-sm text-ink/75">
                {view.markets.join(" · ")}
              </p>
            </div>
          ) : null}

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/#work-with-me"
              className="bg-ink px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-surface"
            >
              Work with {view.firstName}
            </Link>
            <Link
              href="/home-valuation"
              className="border border-ink/25 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink"
            >
              Home valuation
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
