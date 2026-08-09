"use client";

import { formatPrice } from "@/lib/listings/constants";
import {
  HOMEPAGE_PRICE_SLIDER_MAX,
  HOMEPAGE_PRICE_SLIDER_STEP,
} from "@/lib/listings/homepage-personalization";
import { cn } from "@/lib/utils";

export function PriceRangeSlider({
  minPrice,
  maxPrice,
  onChange,
  className,
}: {
  minPrice: number;
  maxPrice: number;
  onChange: (next: { minPrice: number; maxPrice: number }) => void;
  className?: string;
}) {
  const min = Math.min(Math.max(0, minPrice), HOMEPAGE_PRICE_SLIDER_MAX);
  const max = Math.min(
    Math.max(min, maxPrice),
    HOMEPAGE_PRICE_SLIDER_MAX,
  );
  const minPct = (min / HOMEPAGE_PRICE_SLIDER_MAX) * 100;
  const maxPct = (max / HOMEPAGE_PRICE_SLIDER_MAX) * 100;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">{formatPrice(min)}</span>
        <span className="text-ink/40">to</span>
        <span className="font-semibold text-ink">
          {max >= HOMEPAGE_PRICE_SLIDER_MAX
            ? `${formatPrice(HOMEPAGE_PRICE_SLIDER_MAX)}+`
            : formatPrice(max)}
        </span>
      </div>

      <div className="relative h-8 touch-none">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-mist" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-canopy"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range"
          aria-label="Minimum price"
          min={0}
          max={HOMEPAGE_PRICE_SLIDER_MAX}
          step={HOMEPAGE_PRICE_SLIDER_STEP}
          value={min}
          onChange={(e) => {
            const nextMin = Number(e.target.value);
            onChange({
              minPrice: Math.min(nextMin, max),
              maxPrice: max,
            });
          }}
          className="pointer-events-none absolute inset-0 z-20 m-0 h-8 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-canopy [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-canopy [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
        />
        <input
          type="range"
          aria-label="Maximum price"
          min={0}
          max={HOMEPAGE_PRICE_SLIDER_MAX}
          step={HOMEPAGE_PRICE_SLIDER_STEP}
          value={max}
          onChange={(e) => {
            const nextMax = Number(e.target.value);
            onChange({
              minPrice: min,
              maxPrice: Math.max(nextMax, min),
            });
          }}
          className="pointer-events-none absolute inset-0 z-30 m-0 h-8 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-canopy [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-canopy [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
        />
      </div>

      <div className="flex justify-between text-[11px] font-medium text-ink/40">
        <span>$0</span>
        <span>{formatPrice(HOMEPAGE_PRICE_SLIDER_MAX)}+</span>
      </div>
    </div>
  );
}
