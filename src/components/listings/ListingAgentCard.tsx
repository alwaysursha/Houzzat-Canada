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

  if (
    !photoUrl &&
    !name &&
    !title &&
    !cell &&
    !brokerageLogoUrl &&
    !brokerageName
  ) {
    return null;
  }

  const phoneRow = cell ? (
    cellHref ? (
      <a
        href={cellHref}
        className="mt-3 inline-flex max-w-full items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2 transition hover:bg-white/14"
      >
        <Phone
          className="size-4 shrink-0 text-white/90"
          strokeWidth={2}
          aria-hidden
        />
        <span className="min-w-0 truncate font-display text-[15px] font-medium tracking-tight text-white">
          {cell}
        </span>
      </a>
    ) : (
      <p className="mt-3 inline-flex max-w-full items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2">
        <Phone
          className="size-4 shrink-0 text-white/90"
          strokeWidth={2}
          aria-hidden
        />
        <span className="min-w-0 truncate font-display text-[15px] font-medium tracking-tight text-white">
          {cell}
        </span>
      </p>
    )
  ) : null;

  return (
    <section
      aria-labelledby="listing-assigned-agent-heading"
      className={cn(
        "relative isolate overflow-hidden rounded-[22px] border border-canopy/25 text-white shadow-[0_10px_30px_-22px_rgba(16,28,24,0.45)]",
        className,
      )}
    >
      {/* Site canopy green — lighter, quieter CSS layers only */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(165deg,#1f6b52_0%,#1a5d47_48%,#175441_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_-20%,rgba(255,255,255,0.16),transparent_58%)]"
      />
      <div
        aria-hidden
        className="absolute -bottom-[45%] left-1/2 h-[70%] w-[140%] -translate-x-1/2 rounded-[100%] bg-white/[0.06]"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(rgba(255,255,255,0.9)_0.55px,transparent_0.55px)] [background-size:3.5px_3.5px]"
      />

      <div className="relative z-10 flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
        <h2
          id="listing-assigned-agent-heading"
          className="text-center font-display text-xl font-semibold leading-none tracking-tight text-white"
        >
          Your assigned Agent
        </h2>

        <div
          className={cn(
            "grid items-center gap-3.5",
            photoUrl ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1",
          )}
        >
          {photoUrl ? (
            <div className="size-[6.25rem] shrink-0 overflow-hidden rounded-full ring-[2px] ring-white/90 sm:size-[6.75rem]">
              {/* eslint-disable-next-line @next/next/no-img-element -- tenant-hosted branding URLs */}
              <img
                src={photoUrl}
                alt=""
                className="h-full w-full object-cover object-top"
                decoding="async"
              />
            </div>
          ) : null}

          {(name || title || cell) ? (
            <div className="min-w-0">
              {name ? (
                <p className="font-display text-[1.35rem] font-medium leading-tight tracking-[-0.02em] text-white sm:text-[1.5rem]">
                  {name}
                </p>
              ) : null}
              {title ? (
                <p className="mt-1 font-display text-sm font-light tracking-[-0.01em] text-white/78">
                  {title}
                </p>
              ) : null}
              {phoneRow}
            </div>
          ) : null}
        </div>

        {brokerageLogoUrl || brokerageName ? (
          <div
            className={cn(
              "flex items-center gap-3 border-t border-white/20 pt-4",
            )}
          >
            {brokerageLogoUrl ? (
              <div className="flex h-10 shrink-0 items-center rounded-md bg-white px-2.5 py-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- tenant-hosted branding URLs */}
                <img
                  src={brokerageLogoUrl}
                  alt=""
                  className="h-6 w-auto max-w-[7.5rem] object-contain object-left"
                  decoding="async"
                />
              </div>
            ) : null}
            {brokerageLogoUrl && brokerageName ? (
              <span aria-hidden className="h-8 w-px shrink-0 bg-white/40" />
            ) : null}
            {brokerageName ? (
              <p className="min-w-0 font-display text-[13px] font-light leading-snug tracking-[-0.01em] text-white/92">
                {brokerageName}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
