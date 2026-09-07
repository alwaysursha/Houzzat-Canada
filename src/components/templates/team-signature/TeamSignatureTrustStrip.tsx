import type { TeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";

/**
 * Stage 6.11E.2 — qualitative trust / positioning only (no invented metrics).
 */
export function TeamSignatureTrustStrip({
  view,
}: {
  view: TeamSignatureView;
}) {
  const items = [
    {
      label: "Team representation",
      body: "Coordinated buyer and seller guidance under one brand.",
    },
    {
      label: "Local market focus",
      body: view.serviceArea
        ? `Active across ${view.serviceArea}.`
        : "Grounded in the neighbourhoods we serve every day.",
    },
    {
      label: "Full-service desk",
      body: "Search, valuation, and listing support with clear next steps.",
    },
  ];

  return (
    <section
      className="border-y border-[var(--ts-ink,#0F6B4C)]/10 bg-[var(--ts-surface,#FFFFFF)] px-4 py-10 sm:px-6 lg:px-10"
      data-ts-section="trust"
      aria-label="Team positioning"
    >
      <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-3 sm:gap-10">
        {items.map((item) => (
          <div key={item.label} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ts-ink,#0F6B4C)]/45">
              {item.label}
            </p>
            <p className="text-sm leading-relaxed text-[var(--ts-ink,#0F6B4C)]/75">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
