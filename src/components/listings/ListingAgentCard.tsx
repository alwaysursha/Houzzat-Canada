import { Phone } from "lucide-react";
import type { PublicAgentIdentity } from "@/lib/tenancy/resolve-public-agent-identity";
import { cn } from "@/lib/utils";

function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/**
 * Listing aside: workspace public / primary agent + brokerage.
 * Missing fields are omitted — no empty photo or blank rows.
 */
export function ListingAgentCard({
  agent,
  className,
}: {
  agent: PublicAgentIdentity | null | undefined;
  className?: string;
}) {
  if (!agent) return null;

  const photoUrl = agent.photoUrl?.trim() || null;
  const name = agent.name?.trim() || null;
  const title = agent.title?.trim() || null;
  const cell = agent.phone?.trim() || null;
  const cellHref = cell ? telHref(cell) : null;
  const brokerageLogoUrl = agent.brokerageLogoUrl?.trim() || null;
  const brokeragePhone = agent.brokeragePhone?.trim() || null;
  const brokerageHref = brokeragePhone ? telHref(brokeragePhone) : null;

  const hasAnything =
    photoUrl ||
    name ||
    title ||
    cell ||
    brokerageLogoUrl ||
    brokeragePhone;
  if (!hasAnything) return null;

  return (
    <section
      aria-label="Agent"
      className={cn(
        "rounded-[22px] border border-line/80 bg-white p-4 shadow-[0_10px_30px_-22px_rgba(16,28,24,0.45)] sm:p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted branding URLs
          <img
            src={photoUrl}
            alt=""
            className="size-16 shrink-0 rounded-2xl object-cover object-top"
            decoding="async"
          />
        ) : null}
        {(name || title) ? (
          <div className="min-w-0 flex-1 pt-0.5">
            {name ? (
              <p className="font-display text-lg font-semibold leading-tight tracking-tight text-ink">
                {name}
              </p>
            ) : null}
            {title ? (
              <p className="mt-1 text-sm text-ink/55">{title}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {cell ? (
        cellHref ? (
          <a
            href={cellHref}
            className="mt-3.5 flex items-center gap-2 text-sm font-semibold text-canopy transition hover:text-canopy-deep"
          >
            <Phone className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{cell}</span>
          </a>
        ) : (
          <p className="mt-3.5 flex items-center gap-2 text-sm font-semibold text-ink">
            <Phone className="size-3.5 shrink-0 text-ink/40" aria-hidden />
            <span className="min-w-0 truncate">{cell}</span>
          </p>
        )
      ) : null}

      {brokerageLogoUrl || brokeragePhone ? (
        <div
          className={cn(
            "mt-4 flex items-center gap-3 border-t border-line/70 pt-3.5",
            !brokerageLogoUrl && "justify-start",
          )}
        >
          {brokerageLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted branding URLs
            <img
              src={brokerageLogoUrl}
              alt=""
              className="h-8 w-auto max-w-[9rem] object-contain object-left"
              decoding="async"
            />
          ) : null}
          {brokeragePhone ? (
            brokerageHref ? (
              <a
                href={brokerageHref}
                className="min-w-0 text-sm font-medium text-ink/70 transition hover:text-ink"
              >
                {brokeragePhone}
              </a>
            ) : (
              <p className="min-w-0 text-sm font-medium text-ink/70">
                {brokeragePhone}
              </p>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
