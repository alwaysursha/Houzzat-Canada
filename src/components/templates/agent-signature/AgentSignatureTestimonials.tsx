import type { AgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";

/** Sample testimonials in demo preview only — hidden for live tenants. */
export function AgentSignatureTestimonials({
  view,
}: {
  view: AgentSignatureView;
}) {
  if (!view.testimonials || view.testimonials.length === 0) return null;

  return (
    <section
      className="bg-ink px-4 py-16 text-surface sm:px-6 lg:px-10 lg:py-24"
      data-as-section="testimonials"
    >
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-surface/40">
          {view.isDemoPreview
            ? "Sample testimonials · preview only"
            : "Testimonials"}
        </p>
        <h2 className="mt-3 font-display text-3xl tracking-tight sm:text-4xl">
          What clients say
        </h2>

        <div className="mt-12 space-y-14">
          {view.testimonials.map((t, index) => (
            <blockquote
              key={t.attribution}
              className={
                index > 0 ? "border-t border-surface/15 pt-14" : undefined
              }
            >
              <p className="font-display text-2xl leading-snug text-surface/95 sm:text-3xl">
                “{t.quote}”
              </p>
              <footer className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-surface/40">
                {t.attribution}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
