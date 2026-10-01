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
        "min-w-0 overflow-hidden rounded-none border-0 bg-transparent p-0 md:rounded-2xl md:border md:border-line/50 md:bg-surface md:p-6",
        id &&
          "scroll-mt-[calc(var(--site-header-stack,4rem)+3.25rem)]",
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
              <p className="text-xs font-medium text-ink/45">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2
                className={cn(
                  "font-sans text-lg font-semibold tracking-tight text-ink sm:text-xl",
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
