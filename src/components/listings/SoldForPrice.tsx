import {
  closedPriceAccentClass,
  closedPriceLabel,
  formatListPrice,
} from "@/lib/listings/constants";
import type { ListingStatus, ListingTransactionType } from "@prisma/client";
import { cn } from "@/lib/utils";

type SoldForPriceProps = {
  listPrice: number;
  soldPrice: number | null;
  status: ListingStatus;
  transactionType: ListingTransactionType | string;
  /** Dark photo overlays vs light cards / detail pages. */
  tone?: "dark" | "light";
  /** Locked for guests / verify-locked — show gate hint instead of sold price. */
  locked?: boolean;
  /**
   * Why the price is locked.
   * sign-in → “Sign in required”; verify → “Email verification required”.
   */
  lockReason?: "sign-in" | "verify";
  className?: string;
  size?: "sm" | "md" | "lg";
};

/**
 * Closed listing price block: struck asking price + “Sold For:” / “Leased For:”.
 * Sold/Leased For + price use danger red site-wide.
 */
export function SoldForPrice({
  listPrice,
  soldPrice,
  status,
  transactionType,
  tone = "light",
  locked = false,
  lockReason = "sign-in",
  className,
  size = "md",
}: SoldForPriceProps) {
  const isLease = status === "LEASED" || transactionType === "LEASE";
  const closedLabel = closedPriceLabel(status, transactionType);
  const forLabel = isLease ? "Leased For" : "Sold For";
  const askingLabel = isLease ? "Asking rent" : "Asking";
  const soldAccent = closedPriceAccentClass(status, transactionType, tone);
  const lockedHint =
    lockReason === "verify"
      ? "Email verification required"
      : "Sign in required";

  const askingClass =
    size === "lg"
      ? "text-base sm:text-lg"
      : size === "sm"
        ? "text-xs"
        : "text-sm";
  const soldLabelClass =
    size === "lg"
      ? "text-sm sm:text-base"
      : size === "sm"
        ? "text-[11px]"
        : "text-xs";
  const soldPriceClass =
    size === "lg"
      ? "text-3xl sm:text-4xl"
      : size === "sm"
        ? "text-base"
        : "text-xl";

  if (tone === "dark") {
    return (
      <div className={cn("min-w-0 space-y-1", className)}>
        <p className={cn("font-medium text-white/70", askingClass)}>
          <span className="mr-1.5">{askingLabel}</span>
          <span className="font-semibold text-white/55 line-through decoration-white/45 decoration-2">
            {formatListPrice(listPrice, transactionType)}
          </span>
        </p>
        {locked || soldPrice == null ? (
          <p className={cn("font-semibold", soldLabelClass, soldAccent)}>
            {forLabel}:{" "}
            <span className="text-white/70">{lockedHint}</span>
          </p>
        ) : (
          <p className="leading-none">
            <span
              className={cn(
                "mr-2 font-semibold uppercase tracking-[0.08em]",
                soldLabelClass,
                soldAccent,
              )}
            >
              {forLabel}
            </span>
            <span
              className={cn(
                "font-bold tracking-tight",
                soldPriceClass,
                soldAccent,
              )}
            >
              {formatListPrice(soldPrice, transactionType)}
            </span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <p className={cn("font-medium text-ink/60", askingClass)}>
        <span className="mr-1.5">{askingLabel}</span>
        <span className="font-semibold text-ink/45 line-through decoration-ink/35 decoration-2">
          {formatListPrice(listPrice, transactionType)}
        </span>
      </p>
      {locked || soldPrice == null ? (
        <p className={cn("font-semibold text-ink/55", soldLabelClass)}>
          {forLabel}:{" "}
          <span className="text-ink/40">{lockedHint}</span>
        </p>
      ) : (
        <p className="leading-none">
          <span
            className={cn(
              "mr-2 font-semibold uppercase tracking-[0.08em]",
              soldLabelClass,
              soldAccent,
            )}
          >
            {forLabel}
          </span>
          <span
            className={cn(
              "font-bold tracking-tight",
              soldPriceClass,
              soldAccent,
            )}
          >
            {formatListPrice(soldPrice, transactionType)}
          </span>
        </p>
      )}
      <span className="sr-only">{closedLabel}</span>
    </div>
  );
}
