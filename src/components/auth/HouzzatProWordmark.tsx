import { useId } from "react";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Open-corner PRO badge (┐ └) — matches native HouzzatPRO BrandMark.
 * `tone="dark"` for mint backgrounds; `tone="light"` for dark/marketing surfaces.
 */
function HouzzatProBadge({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const uid = useId().replace(/:/g, "");
  const fillId = `pro-fill-${uid}`;
  const isDark = tone === "dark";
  const stroke = isDark ? "#6E4F0C" : `url(#${fillId})`;
  const textFill = isDark ? "#5A4010" : `url(#${fillId})`;

  return (
    <svg
      viewBox="0 0 46 20"
      className={cn("shrink-0 overflow-visible", className)}
      aria-hidden
    >
      {!isDark ? (
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
      ) : null}

      {/* Top-right ┐ */}
      <path
        d="M12 2 H38.5 A2 2 0 0 1 40.5 4 V10"
        fill="none"
        stroke={stroke}
        strokeWidth="1.85"
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
      {/* Bottom-left └ */}
      <path
        d="M34 18 H7.5 A2 2 0 0 1 5.5 16 V10"
        fill="none"
        stroke={stroke}
        strokeWidth="1.85"
        strokeLinecap="butt"
        strokeLinejoin="round"
      />

      <text
        x="23"
        y="10"
        textAnchor="middle"
        dominantBaseline="central"
        fill={textFill}
        fontFamily="var(--font-jakarta), system-ui, sans-serif"
        fontSize="11.5"
        fontWeight="800"
        letterSpacing="0.12em"
      >
        PRO
      </text>
    </svg>
  );
}

export function HouzzatProWordmark({
  className,
  size = "lg",
  tone = "light",
}: {
  className?: string;
  proClassName?: string;
  size?: "md" | "lg" | "xl";
  /** `dark` = mint / light surfaces (native sign-in). `light` = dark surfaces. */
  tone?: "light" | "dark";
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
        "inline-flex items-center gap-1.5 font-display tracking-tight text-ink",
        scale,
        className,
      )}
      aria-label={`${SITE_NAME} Pro`}
    >
      <span>{SITE_NAME}</span>
      <HouzzatProBadge
        tone={tone}
        className={cn(
          badgeH,
          "w-auto translate-y-[0.04em]",
          tone === "light" &&
            "[filter:drop-shadow(0_1px_0.5px_rgba(90,64,16,0.45))_drop-shadow(0_2px_3px_rgba(11,92,73,0.2))]",
        )}
      />
    </span>
  );
}
