import { Check } from "lucide-react";

const LEFT_BENEFITS = [
  "Sold data",
  "Listing History",
  "Smart Route System",
] as const;

const RIGHT_BENEFITS = [
  "Listing Updates",
  "Area Updates",
  "Open House Planner",
] as const;

function BenefitItem({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm font-medium text-ink/80">
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-canopy/10 text-canopy">
        <Check className="size-3" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="min-w-0 leading-snug">{label}</span>
    </li>
  );
}

export function AuthBenefitsPanel() {
  return (
    <div className="rounded-xl border border-canopy/15 bg-canopy/[0.04] px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-canopy">
        Access to
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-0">
        <ul className="space-y-2">
          {LEFT_BENEFITS.map((item) => (
            <BenefitItem key={item} label={item} />
          ))}
        </ul>
        <ul className="space-y-2">
          {RIGHT_BENEFITS.map((item) => (
            <BenefitItem key={item} label={item} />
          ))}
        </ul>
      </div>
    </div>
  );
}
