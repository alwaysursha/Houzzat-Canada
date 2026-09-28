import { Check } from "lucide-react";

export const AUTH_BENEFITS = [
  "Sold Prices",
  "Listing History",
  "Save Homes",
  "Property Watch",
  "Route Planner",
  "Connect with an Agent",
] as const;

function BenefitItem({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm text-ink/80">
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-canopy/10 text-canopy">
        <Check className="size-3" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="min-w-0 leading-snug">{label}</span>
    </li>
  );
}

export function AuthBenefitsPanel({
  variant = "list",
}: {
  variant?: "list" | "compact";
}) {
  if (variant === "compact") {
    return (
      <p className="text-center text-[11px] leading-relaxed text-ink/55">
        {AUTH_BENEFITS.join(" · ")}
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {AUTH_BENEFITS.map((item) => (
        <BenefitItem key={item} label={item} />
      ))}
    </ul>
  );
}
