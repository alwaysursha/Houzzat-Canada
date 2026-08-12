import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";

export function HomeRailCardsSkeleton({
  label,
  count = 4,
}: {
  label: string;
  count?: number;
}) {
  return (
    <FreeSwipeRail label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-line bg-surface"
        >
          <div className="aspect-[4/3] animate-pulse bg-mist" />
          <div className="space-y-2 p-3">
            <div className="h-4 w-[66%] animate-pulse rounded bg-mist" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-mist" />
          </div>
        </div>
      ))}
    </FreeSwipeRail>
  );
}
