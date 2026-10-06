"use client";

/** Thin Houzzat-colored progress line — no step counts or percentages. */
export function FunnelProgress({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div
      className="absolute inset-x-0 top-0 h-[3px] overflow-hidden rounded-t-2xl bg-mist"
      aria-hidden
    >
      <div
        className="h-full bg-canopy transition-[width] duration-500 ease-out"
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
