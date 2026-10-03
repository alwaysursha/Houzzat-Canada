import {
  Building2,
  FileText,
  Home,
  Layers,
  Maximize2,
  Ruler,
  type LucideIcon,
} from "lucide-react";
import type { AboutHomePropertyFact } from "@/lib/listings/facts";
import { cn } from "@/lib/utils";

const FACT_ICONS: Record<AboutHomePropertyFact["id"], LucideIcon> = {
  ownership: Home,
  taxes: FileText,
  basement: Layers,
  frontage: Ruler,
  storeys: Building2,
  livingSpace: Maximize2,
};

export function ListingAboutPropertyFacts({
  facts,
}: {
  facts: AboutHomePropertyFact[];
}) {
  if (!facts.length) return null;

  return (
    <div
      data-listing-about-property-facts=""
      className="min-w-0 flex-1 rounded-2xl border border-canopy/15 bg-canopy/[0.06] p-3 sm:p-3.5"
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
        Property facts
      </p>
      <ul className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 xl:grid-cols-3">
        {facts.map((fact) => {
          const Icon = FACT_ICONS[fact.id];
          return (
            <li
              key={fact.id}
              className={cn(
                "flex min-w-0 items-start gap-2.5 rounded-xl border border-canopy/10 bg-surface px-3 py-2.5",
              )}
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-canopy/10 text-canopy">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-medium leading-tight text-ink/45">
                  {fact.label}
                </span>
                <span className="mt-0.5 block font-display text-sm font-medium leading-snug text-ink">
                  {fact.value}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
