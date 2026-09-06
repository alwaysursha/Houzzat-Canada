/**
 * Stage 6.11D.6 — shared agent contact lines (Cell: / Email:).
 * Templates may style; labels come from the platform presentation contract.
 */

import {
  agentCellLabelPrefix,
  agentEmailLabelPrefix,
} from "@/lib/tenancy/professional-identity/presentation";
import { cn } from "@/lib/utils";

export function AgentPublicContactLines({
  cellPhone,
  email,
  className,
  labelClassName,
  linkClassName,
}: {
  /** Canonical agent cell — professionalIdentity.agent.cellPhone (via presentation). */
  cellPhone: string | null | undefined;
  /** Canonical public agent email already resolved by the presentation layer. */
  email: string | null | undefined;
  className?: string;
  /** Quieter label tone — clear, not bold/distracting. */
  labelClassName?: string;
  linkClassName?: string;
}) {
  const cell = cellPhone?.trim() || null;
  const mail = email?.trim() || null;
  if (!cell && !mail) return null;

  return (
    <div
      className={cn("space-y-1", className)}
      data-agent-public-contact="true"
    >
      {cell ? (
        <p data-agent-cell="true">
          <span className={cn(labelClassName)}>{agentCellLabelPrefix()}</span>{" "}
          <a
            href={`tel:${cell.replace(/[^\d+]/g, "")}`}
            className={cn(linkClassName)}
          >
            {cell}
          </a>
        </p>
      ) : null}
      {mail ? (
        <p data-agent-email="true">
          <span className={cn(labelClassName)}>{agentEmailLabelPrefix()}</span>{" "}
          <a href={`mailto:${mail}`} className={cn(linkClassName)}>
            {mail}
          </a>
        </p>
      ) : null}
    </div>
  );
}
