import Link from "next/link";
import type { TeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";

/**
 * Stage 6.11E.2A — premium Contact The Team conversion section.
 */
export function TeamSignatureContactSection({
  view,
}: {
  view: TeamSignatureView;
}) {
  const contactHref = view.email
    ? `mailto:${view.email}`
    : view.phone
      ? `tel:${view.phone}`
      : "/home-valuation";

  return (
    <section
      id="contact-the-team"
      className="scroll-mt-32 relative overflow-hidden bg-[var(--ts-surface,#EEF3F0)] px-4 py-16 sm:px-6 lg:px-10 lg:py-24"
      data-ts-section="contact"
      aria-labelledby="ts-contact-heading"
    >
      <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[var(--ts-ink,#0F6B4C)] lg:block" />
      <div className="relative mx-auto grid max-w-7xl gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="border border-[var(--ts-ink,#0F6B4C)]/12 bg-[var(--ts-surface,#EEF3F0)] p-8 sm:p-10 lg:border-r-0 lg:p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ts-ink,#0F6B4C)]/45">
            Contact the team
          </p>
          <h2
            id="ts-contact-heading"
            className="mt-3 font-display text-4xl tracking-tight text-[var(--ts-ink,#0F6B4C)] sm:text-5xl"
          >
            Start a conversation with {view.teamName}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--ts-ink,#0F6B4C)]/60">
            Buying, selling, or exploring your options — reach the team desk
            directly.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={contactHref}
              className="bg-[var(--ts-ink,#0F6B4C)] px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-surface"
            >
              Contact Us
            </Link>
            <Link
              href="/search"
              className="border border-[var(--ts-ink,#0F6B4C)]/30 px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ts-ink,#0F6B4C)]"
            >
              Browse listings
            </Link>
          </div>
        </div>

        <div className="bg-[var(--ts-ink,#0F6B4C)] p-8 text-surface sm:p-10 lg:p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surface/75">
            Team desk
          </p>
          <div className="mt-6 space-y-5">
            {view.phone ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-surface/70">
                  Phone
                </p>
                <a
                  href={`tel:${view.phone}`}
                  className="mt-1 block font-display text-2xl tracking-tight text-surface hover:underline sm:text-3xl"
                >
                  {view.phone}
                </a>
              </div>
            ) : null}
            {view.email ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-surface/70">
                  Email
                </p>
                <a
                  href={`mailto:${view.email}`}
                  className="mt-1 block text-base text-surface/90 hover:underline sm:text-lg"
                >
                  {view.email}
                </a>
              </div>
            ) : null}
            {!view.phone && !view.email ? (
              <p className="text-sm text-surface/80">
                Add team phone and email in Website Setup to show contact
                details here.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
