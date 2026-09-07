import type { TeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";

/** Sample testimonials in demo preview only — hidden for live tenants. */
export function TeamSignatureTestimonials({
  view,
}: {
  view: TeamSignatureView;
}) {
  if (!view.testimonials || view.testimonials.length === 0) return null;

  return (
    <section
      className="bg-[var(--ts-surface-soft,var(--ts-surface,#EEF3F0))] px-4 py-16 text-[var(--ts-ink,#0F6B4C)] sm:px-6 lg:px-10 lg:py-24"
      data-ts-section="testimonials"
    >
      <div className="mx-auto max-w-4xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ts-ink,#0F6B4C)]/40">
          {view.isDemoPreview
            ? "Sample testimonials · preview only"
            : "Testimonials"}
        </p>
        <h2 className="mt-3 font-display text-3xl tracking-tight text-[var(--ts-ink,#0F6B4C)] sm:text-4xl">
          What clients say about our team
        </h2>

        <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-12">
          {view.testimonials.map((t) => (
            <blockquote
              key={t.attribution}
              className="border-t border-[var(--ts-ink,#0F6B4C)]/15 pt-8"
            >
              <p className="font-display text-xl leading-snug text-[var(--ts-ink,#0F6B4C)] sm:text-2xl">
                “{t.quote}”
              </p>
              <footer className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ts-ink,#0F6B4C)]/40">
                {t.attribution}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
