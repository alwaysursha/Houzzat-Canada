import { cn } from "@/lib/utils";

export function TemperatureGauge({
  score,
  label,
  className,
}: {
  score: number;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = -90 + (clamped / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const x = 50 + 38 * Math.cos(rad);
  const y = 52 + 38 * Math.sin(rad);
  const tone =
    clamped <= 38 ? "text-canopy" : clamped >= 62 ? "text-signal" : "text-ink";

  return (
    <div className={cn("relative mx-auto w-full max-w-[220px]", className)}>
      <svg viewBox="0 0 100 62" className="w-full" aria-hidden>
        <path
          d="M 12 52 A 38 38 0 0 1 88 52"
          fill="none"
          stroke="rgb(20 32 28 / 0.08)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 12 52 A 38 38 0 0 1 88 52"
          fill="none"
          stroke="url(#tempGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * 119.4} 119.4`}
        />
        <defs>
          <linearGradient id="tempGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--canopy)" />
            <stop offset="55%" stopColor="#c4a35a" />
            <stop offset="100%" stopColor="#c45c26" />
          </linearGradient>
        </defs>
        <circle cx={x} cy={y} r="3.5" fill="var(--ink)" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className={cn("font-sans font-semibold text-3xl leading-none", tone)}>{clamped}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
          {label}
        </p>
      </div>
    </div>
  );
}

export function PricePositionBar({
  listPrice,
  medianAsk,
  medianSold,
  className,
}: {
  listPrice: number;
  medianAsk: number | null;
  medianSold: number | null;
  className?: string;
}) {
  const points = [listPrice, medianAsk, medianSold].filter(
    (n): n is number => n != null && n > 0,
  );
  if (points.length < 2) {
    return (
      <p className="text-sm text-ink/50">
        Not enough area pricing yet to place this home on a range.
      </p>
    );
  }
  const min = Math.min(...points) * 0.92;
  const max = Math.max(...points) * 1.08;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative h-3 rounded-full bg-mist">
        <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-canopy/25 via-canopy/40 to-signal/35" />
        {medianAsk != null ? (
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink/50 shadow"
            style={{ left: `${pct(medianAsk)}%` }}
            title="Median ask"
          />
        ) : null}
        {medianSold != null ? (
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-signal shadow"
            style={{ left: `${pct(medianSold)}%` }}
            title="Median sold"
          />
        ) : null}
        <span
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-canopy shadow-md"
          style={{ left: `${pct(listPrice)}%` }}
          title="This listing"
        />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-ink/55">
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-canopy" /> This home
        </li>
        {medianAsk != null ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-ink/40" /> Median ask
          </li>
        ) : null}
        {medianSold != null ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-signal" /> Median sold
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function PriceTimelineChart({
  points,
  signedIn,
  className,
}: {
  points: Array<{ date: string; price: number; label: string; public: boolean }>;
  signedIn: boolean;
  className?: string;
}) {
  const visible = points.filter((p) => signedIn || p.public);
  if (visible.length < 2) {
    return (
      <p className={cn("text-sm text-ink/50", className)}>
        Price history will appear here as updates are recorded.
      </p>
    );
  }

  const prices = visible.map((p) => p.price);
  const min = Math.min(...prices) * 0.97;
  const max = Math.max(...prices) * 1.03;
  const w = 320;
  const h = 120;
  const padX = 12;
  const padY = 16;
  const coords = visible.map((p, i) => {
    const x = padX + (i / (visible.length - 1)) * (w - padX * 2);
    const y = padY + (1 - (p.price - min) / (max - min || 1)) * (h - padY * 2);
    return { x, y, ...p };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Price timeline">
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--tenant-primary-rgb) / 0.22)" />
            <stop offset="100%" stopColor="rgb(var(--tenant-primary-rgb) / 0)" />
          </linearGradient>
        </defs>
        <path
          d={`${path} L ${coords[coords.length - 1]!.x} ${h - 4} L ${coords[0]!.x} ${h - 4} Z`}
          fill="url(#priceFill)"
        />
        <path d={path} fill="none" stroke="var(--canopy)" strokeWidth="2.5" strokeLinejoin="round" />
        {coords.map((c) => (
          <circle key={`${c.date}-${c.price}`} cx={c.x} cy={c.y} r="3.5" fill="var(--canopy)" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-medium text-ink/40">
        <span>
          {new Date(visible[0]!.date).toLocaleDateString("en-CA", {
            month: "short",
            year: "2-digit",
          })}
        </span>
        <span>
          {new Date(visible[visible.length - 1]!.date).toLocaleDateString("en-CA", {
            month: "short",
            year: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

export function LifestyleBars({
  categories,
  className,
}: {
  categories: Array<{ label: string; strength: number; count: number; nearestKm: number | null }>;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-3", className)}>
      {categories.map((cat) => (
        <li key={cat.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-ink">{cat.label}</span>
            <span className="text-ink/45">
              {cat.count === 0
                ? "None nearby"
                : cat.nearestKm != null
                  ? `${cat.count} · from ${cat.nearestKm.toFixed(1)} km`
                  : `${cat.count}`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-mist">
            <div
              className="h-full rounded-full bg-canopy transition-[width] duration-500"
              style={{ width: `${Math.max(cat.strength, cat.count > 0 ? 8 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OwnershipDonut({
  mortgage,
  tax,
  maint,
  className,
}: {
  mortgage: number;
  tax: number;
  maint: number;
  className?: string;
}) {
  const total = Math.max(mortgage + tax + maint, 1);
  const parts = [
    { key: "mortgage", value: mortgage, color: "var(--canopy)" },
    { key: "tax", value: tax, color: "#c4a35a" },
    { key: "maint", value: maint, color: "#6b8f85" },
  ].filter((p) => p.value > 0);

  let cursor = 0;
  const segments = parts.map((p) => {
    const start = cursor;
    const sweep = (p.value / total) * 360;
    cursor += sweep;
    return { ...p, start, sweep };
  });

  function arc(startDeg: number, sweepDeg: number) {
    const r = 36;
    const cx = 50;
    const cy = 50;
    const start = ((startDeg - 90) * Math.PI) / 180;
    const end = ((startDeg + sweepDeg - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = sweepDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <svg viewBox="0 0 100 100" className="size-28 shrink-0" aria-hidden>
        {segments.map((s) => (
          <path key={s.key} d={arc(s.start, Math.max(s.sweep, 0.5))} fill={s.color} />
        ))}
        <circle cx="50" cy="50" r="22" fill="var(--color-surface, #fff)" />
      </svg>
      <ul className="space-y-1.5 text-xs text-ink/60">
        <li className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-canopy" /> Mortgage
        </li>
        {tax > 0 ? (
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#c4a35a]" /> Property tax
          </li>
        ) : null}
        {maint > 0 ? (
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#6b8f85]" /> Maint. fee
          </li>
        ) : null}
      </ul>
    </div>
  );
}
