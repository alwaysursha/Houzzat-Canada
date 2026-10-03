import { Phone } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone/format";
import { normalizeToE164 } from "@/lib/sms/e164";
import type { PublicAgentIdentity } from "@/lib/tenancy/resolve-public-agent-identity";
import { cn } from "@/lib/utils";

function telHref(phone: string): string | null {
  const e164 = normalizeToE164(phone);
  if (e164) return `tel:${e164}`;
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
  const cellRaw = agent.phone?.trim() || null;
  const cell = cellRaw ? formatPhoneDisplay(cellRaw) || cellRaw : null;
  const cellHref = cellRaw ? telHref(cellRaw) : null;
  const brokerageLogoUrl = agent.brokerageLogoUrl?.trim() || null;
  const brokerageName = agent.brokerageName?.trim() || null;

  const hasTop =
    photoUrl || name || title || cell;
  const hasBottom = brokerageLogoUrl || brokerageName;
  if (!hasTop && !hasBottom) return null;

  return (
    <section
      aria-label="Agent"
      className={cn(
        "rounded-[22px] border border-line/80 bg-white p-4 shadow-[0_10px_30px_-22px_rgba(16,28,24,0.45)] sm:p-5",
        className,
      )}
    >
      {hasTop ? (
        <div
          className={cn(
            "grid items-start gap-3.5",
            photoUrl
              ? "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
              : "grid-cols-1",
          )}
        >
          {photoUrl ? (
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-mist">
              {/* eslint-disable-next-line @next/next/no-img-element -- tenant-hosted branding URLs */}
              <img
                src={photoUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-top"
                decoding="async"
              />
            </div>
          ) : null}

          {(name || title || cell) ? (
            <div className="min-w-0 pt-0.5">
              {name ? (
                <p className="font-display text-lg font-semibold leading-tight tracking-tight text-ink sm:text-xl">
                  {name}
                </p>
              ) : null}
              {title ? (
                <p className="mt-1 text-sm text-ink/55">{title}</p>
              ) : null}
              {cell ? (
                cellHref ? (
                  <a
                    href={cellHref}
                    className="mt-3 inline-flex max-w-full items-center gap-2 text-sm font-semibold text-canopy transition hover:text-canopy-deep"
                  >
                    <Phone className="size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{cell}</span>
                  </a>
                ) : (
                  <p className="mt-3 inline-flex max-w-full items-center gap-2 text-sm font-semibold text-ink">
                    <Phone className="size-3.5 shrink-0 text-ink/40" aria-hidden />
                    <span className="min-w-0 truncate">{cell}</span>
                  </p>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {hasBottom ? (
        <div
          className={cn(
            "grid items-center gap-3",
            hasTop && "mt-4 border-t border-line/70 pt-3.5",
            brokerageLogoUrl && brokerageName
              ? "grid-cols-[auto_minmax(0,1fr)]"
              : "grid-cols-1",
          )}
        >
          {brokerageLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted branding URLs
            <img
              src={brokerageLogoUrl}
              alt=""
              className="h-9 w-auto max-w-[10rem] object-contain object-left"
              decoding="async"
            />
          ) : null}
          {brokerageName ? (
            <p
              className={cn(
                "min-w-0 text-sm font-medium leading-snug text-ink/70",
                brokerageLogoUrl && "text-right",
              )}
            >
              {brokerageName}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
