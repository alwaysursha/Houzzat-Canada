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
      controlled by The Canadian Real Estate Association (CREA). Listing content
      will display brokerage attribution and board disclaimers once PropTx sync
      is live. Sold prices and listing history are available to Houzzat clients
      (anyone who registers) under VOW terms where required by TRREB.
    </aside>
  );
}
