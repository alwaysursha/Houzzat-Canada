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
      data-listing-about-quick-facts=""
      className="min-w-0 flex-1"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
        Quick facts
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {facts.map((fact) => {
          const Icon = FACT_ICONS[fact.id];
          return (
            <li
              key={fact.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-canopy/[0.08] px-2.5 py-1.5 text-sm leading-snug text-ink"
            >
              <Icon
                className="size-3.5 shrink-0 text-canopy"
                aria-hidden
              />
              <span className="min-w-0 font-medium">{fact.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
