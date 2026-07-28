import { cn } from "@/lib/utils";

export function MlsDisclaimer({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "rounded-lg border border-line bg-surface/80 px-4 py-3 text-xs leading-relaxed text-ink/60",
        className,
      )}
    >
      MLS®, Multiple Listing Service® and the associated logos are owned or
      controlled by The Canadian Real Estate Association (CREA) and are used
      under license. Listing information is provided by TRREB members via PropTx
      and is believed to be reliable but not guaranteed. Brokerage attribution is
      shown on each listing. Sold prices and listing history are available only
      to registered Houzzat clients under TRREB Virtual Office Website (VOW)
      rules.
    </aside>
  );
}
