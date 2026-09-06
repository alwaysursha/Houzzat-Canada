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
  tone?: "default" | "agent-signature";
}) {
  if (!brokerageIdentityHasAnyPublicField(brokerage)) {
    return null;
  }

  const muted =
    tone === "agent-signature" ? "text-ink/65" : "text-ink/70";
  const strong =
    tone === "agent-signature" ? "text-ink" : "text-ink";

  return (
    <div
      className={cn(
        "flex max-w-xl flex-col gap-4 sm:flex-row sm:items-start sm:gap-5",
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
            className="block h-12 w-auto max-w-[11rem] object-contain object-left sm:h-14 sm:max-w-[14rem]"
            style={{ minHeight: LOGO_MIN_H }}
            data-brokerage-logo="true"
            data-brokerage-logo-min-h={LOGO_MIN_H}
          />
        </div>
      ) : null}

      <address className={cn("not-italic text-sm leading-relaxed", muted)}>
        {brokerage.name ? (
          <p
            className={cn("font-semibold", strong)}
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
