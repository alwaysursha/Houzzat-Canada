import type { AgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";

/** Demo-only credibility strip — omitted for live tenants without real metrics. */
export function AgentSignatureTrustStrip({
  view,
}: {
  view: AgentSignatureView;
}) {
  if (!view.metrics || view.metrics.length === 0) return null;

  return (
    <section
      className="border-b border-ink/10 bg-surface"
      aria-label="Sample credentials for template preview"
    >
      {view.isDemoPreview ? (
        <p className="border-b border-ink/8 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/45 sm:px-6">
          Sample preview metrics · not live performance claims
        </p>
      ) : null}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-ink/10 sm:grid-cols-4">
        {view.metrics.map((m) => (
          <div
            key={m.label}
            className="bg-surface px-4 py-7 text-center sm:px-6 sm:py-9"
          >
            <p className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
              {m.value}
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
              {m.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
