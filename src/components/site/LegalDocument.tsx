import type { ReactNode } from "react";

export function LegalDocument({
  title,
  updated,
  version,
  children,
}: {
  title: string;
  updated: string;
  version?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink/50">
        Last updated: {updated}
        {version ? (
          <>
            {" "}
            · Version: <span className="font-mono text-ink/70">{version}</span>
          </>
        ) : null}
      </p>
      <div className="prose-legal mt-8 space-y-6 text-[15px] leading-relaxed text-ink/75 [&_a]:font-medium [&_a]:text-canopy [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-ink [&_li]:mt-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
