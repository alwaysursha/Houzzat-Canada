import type { ReactNode } from "react";

export function PlatformPageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function PlatformStatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

export function PlatformStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function PlatformPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-[#111827]">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PlatformEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-[#111827]/60 px-6 py-10 text-center text-sm text-slate-400">
      {message}
    </div>
  );
}

export function PlatformErrorState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-6 py-8">
      <p className="text-sm font-semibold text-red-300">{title}</p>
      <p className="mt-2 text-sm text-red-200/80">{message}</p>
    </div>
  );
}

export function PlatformBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: "bg-slate-800 text-slate-200",
    success: "bg-emerald-950 text-emerald-300",
    warning: "bg-amber-950 text-amber-300",
    danger: "bg-red-950 text-red-300",
    info: "bg-sky-950 text-sky-300",
  } as const;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function PlatformTableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="min-w-full divide-y divide-slate-800 text-sm">{children}</table>
    </div>
  );
}

export function PlatformPagination({
  nextCursor,
  basePath,
  searchParams,
}: {
  nextCursor: string | null;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  if (!nextCursor) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value);
  }
  params.set("cursor", nextCursor);
  const href = `${basePath}?${params.toString()}`;
  return (
    <div className="mt-4 flex justify-end">
      <a
        href={href}
        className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
      >
        Next page
      </a>
    </div>
  );
}
