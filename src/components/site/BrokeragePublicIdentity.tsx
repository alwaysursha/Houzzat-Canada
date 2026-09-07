/**
 * Stage 6.11D — shared public brokerage identity block (footer / lower site).
 * Directly visible — not Terms/Privacy/modal/accordion/hover-only.
 */

import {
  TEMPLATE_BROKERAGE_IDENTITY_CONTRACT,
  brokerageFaxLabelPrefix,
  brokerageIdentityHasAnyPublicField,
  brokeragePhoneLabelPrefix,
} from "@/lib/tenancy/professional-identity/presentation";
import type { PublicBrokerageIdentity } from "@/lib/tenancy/professional-identity/types";
import { cn } from "@/lib/utils";

const LOGO_MIN_H = TEMPLATE_BROKERAGE_IDENTITY_CONTRACT.brokerageLogoMinCssHeightPx;

export function BrokeragePublicIdentity({
  brokerage,
  className,
  tone = "default",
}: {
  brokerage: PublicBrokerageIdentity;
  className?: string;
  /** Agent Signature mist footer vs Default mist/line footer. */
  tone?: "default" | "agent-signature" | "team-signature";
}) {
  if (!brokerageIdentityHasAnyPublicField(brokerage)) {
    return null;
  }

  const muted =
    tone === "agent-signature"
      ? "text-ink/65"
      : tone === "team-signature"
        ? "text-[var(--ts-ink,#0F6B4C)]/70"
        : "text-ink/70";
  const strong =
    tone === "agent-signature"
      ? "text-ink"
      : tone === "team-signature"
        ? "text-[var(--ts-ink,#0F6B4C)]"
        : "text-ink";

  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-start sm:gap-6",
        tone === "team-signature"
          ? "border border-[var(--ts-ink,#0F6B4C)]/12 bg-[var(--ts-surface,#EEF3F0)] p-5 sm:p-6"
          : null,
        className,
      )}
      data-brokerage-public-identity="true"
    >
      {brokerage.logoUrl ? (
        <div className="inline-flex shrink-0 self-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- tenant R2 / public asset */}
          <img
            src={brokerage.logoUrl}
            alt={brokerage.name ? `${brokerage.name} logo` : "Brokerage logo"}
            className={cn(
              "block w-auto object-contain object-left",
              tone === "team-signature"
                ? "h-16 max-w-[14rem] sm:h-[4.5rem] sm:max-w-[16rem]"
                : "h-12 max-w-[11rem] sm:h-14 sm:max-w-[14rem]",
            )}
            style={{ minHeight: LOGO_MIN_H }}
            data-brokerage-logo="true"
            data-brokerage-logo-min-h={LOGO_MIN_H}
          />
        </div>
      ) : null}

      <address
        className={cn(
          "not-italic leading-relaxed",
          tone === "team-signature" ? "text-sm sm:text-base" : "text-sm",
          muted,
        )}
      >
        {brokerage.name ? (
          <p
            className={cn(
              tone === "team-signature"
                ? "font-display text-xl font-normal tracking-tight sm:text-2xl"
                : "font-semibold",
              strong,
            )}
            data-brokerage-name="true"
          >
            {brokerage.name}
          </p>
        ) : null}
        {brokerage.address
          ? brokerage.address
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => (
                <p key={line} data-brokerage-address-line="true">
                  {line}
                </p>
              ))
          : null}
        {brokerage.phone ? (
          <p data-brokerage-phone="true">
            {brokeragePhoneLabelPrefix()}{" "}
            <a
              href={`tel:${brokerage.phone.replace(/[^\d+]/g, "")}`}
              className="inline-flex min-h-11 items-center underline-offset-2 hover:underline"
            >
              {brokerage.phone}
            </a>
          </p>
        ) : null}
        {brokerage.fax ? (
          <p data-brokerage-fax="true">
            {brokerageFaxLabelPrefix()} {brokerage.fax}
          </p>
        ) : null}
      </address>
    </div>
  );
}
