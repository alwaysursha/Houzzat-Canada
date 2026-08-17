import { useId } from "react";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Compact champagne PRO badge (reference layout).
 * Darker metallic stops + understroke so it stays readable on mint.
 * Brackets hug the type — minimal inset.
 */
function HouzzatProBadge({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const fillId = `pro-fill-${uid}`;

  return (
    <svg
      viewBox="0 0 46 20"
      className={cn("shrink-0 overflow-visible", className)}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={fillId}
          x1="2"
          y1="1"
          x2="44"
          y2="19"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#D4B04A" />
          <stop offset="18%" stopColor="#C9A227" />
          <stop offset="45%" stopColor="#9A7218" />
          <stop offset="72%" stopColor="#6E4F0C" />
          <stop offset="100%" stopColor="#4A3508" />
        </linearGradient>
      </defs>

      {/* Top-right ┐ — open end extended outward over P */}
      <path
        d="M8.5 1.6 H39.2 A1.8 1.8 0 0 1 41 3.4 V11.4"
        fill="none"
        stroke="#5A4010"
        strokeWidth="2.35"
        strokeLinecap="butt"
        strokeLinejoin="round"
        opacity="0.35"
      />
      <path
        d="M8.5 1.6 H39.2 A1.8 1.8 0 0 1 41 3.4 V11.4"
        fill="none"
        stroke={`url(#${fillId})`}
        strokeWidth="1.85"
        strokeLinecap="butt"
        strokeLinejoin="round"
      />

      {/* Bottom-left └ — open end extended outward under O */}
      <path
        d="M37.5 18.4 H6.8 A1.8 1.8 0 0 1 5 16.6 V8.6"
        fill="none"
        stroke="#5A4010"
        strokeWidth="2.35"
        strokeLinecap="butt"
        strokeLinejoin="round"
        opacity="0.35"
      />
      <path
        d="M37.5 18.4 H6.8 A1.8 1.8 0 0 1 5 16.6 V8.6"
        fill="none"
        stroke={`url(#${fillId})`}
        strokeWidth="1.85"
        strokeLinecap="butt"
        strokeLinejoin="round"
      />

      {/* Understroke for contrast, then gold fill */}
      <text
        x="23"
        y="10"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#5A4010"
        fillOpacity="0.28"
        fontFamily="var(--font-jakarta), system-ui, sans-serif"
        fontSize="12"
        fontWeight="800"
        letterSpacing="0.15"
      >
        PRO
      </text>
      <text
        x="23"
        y="10"
        textAnchor="middle"
        dominantBaseline="central"
        fill={`url(#${fillId})`}
        fontFamily="var(--font-jakarta), system-ui, sans-serif"
        fontSize="12"
        fontWeight="800"
        letterSpacing="0.15"
      >
        PRO
      </text>
    </svg>
  );
}

export function HouzzatProWordmark({
  className,
  size = "lg",
}: {
  className?: string;
  proClassName?: string;
  size?: "md" | "lg" | "xl";
}) {
  const scale =
    size === "xl"
      ? "text-4xl sm:text-5xl"
      : size === "md"
        ? "text-2xl"
        : "text-3xl sm:text-4xl";

  const badgeH =
    size === "xl" ? "h-[0.68em]" : size === "md" ? "h-[0.66em]" : "h-[0.68em]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-display tracking-tight text-ink",
        scale,
        className,
      )}
      aria-label={`${SITE_NAME} Pro`}
    >
      <span>{SITE_NAME}</span>
      <HouzzatProBadge
        className={cn(
          badgeH,
          "w-auto translate-y-[0.04em] [filter:drop-shadow(0_1px_0.5px_rgba(90,64,16,0.45))_drop-shadow(0_2px_3px_rgba(11,92,73,0.2))]",
        )}
      />
    </span>
  );
}
