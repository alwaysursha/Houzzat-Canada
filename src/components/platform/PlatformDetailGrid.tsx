import type { ReactNode } from "react";

export function PlatformDetailGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{item.label}</dt>
          <dd className="mt-1 text-sm text-slate-100">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PlatformSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {children}
    </section>
  );
}
