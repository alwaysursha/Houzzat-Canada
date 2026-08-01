import { cn } from "@/lib/utils";

/** Shared listing-detail panel shell — matches Houzzat Insights styling. */
export function ListingSection({
  id,
  eyebrow,
  title,
  hint,
  action,
  children,
  className,
  headerClassName,
  as: Tag = "section",
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  as?: "section" | "div" | "aside";
}) {
  const showHeader = Boolean(eyebrow || title || hint || action);

  return (
    <Tag
      id={id}
      className={cn(
        "rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-6",
        className,
      )}
    >
      {showHeader ? (
        <header
          className={cn(
            "mb-4 flex flex-wrap items-start justify-between gap-3",
            headerClassName,
          )}
        >
          <div className="min-w-0 max-w-2xl">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2
                className={cn(
                  "font-display text-xl text-ink sm:text-2xl",
                  eyebrow ? "mt-1" : null,
                )}
              >
                {title}
              </h2>
            ) : null}
            {hint ? (
              <p className="mt-1 text-sm leading-relaxed text-ink/55">{hint}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}
