import Image from "next/image";
import Link from "next/link";
import type { TimelineItem } from "@/lib/agent/customer-timeline";
import { cn } from "@/lib/utils";

function tone(type: string) {
  const t = type.toUpperCase();
  if (t.includes("CONTACT_UPDATE") || t.includes("CONTACT_UPDATE"))
    return "bg-amber-100 text-amber-900";
  if (t.includes("EMAIL") || t === "EMAIL") return "bg-canopy/12 text-canopy-deep";
  if (t.includes("NOTE") || t === "NOTE") return "bg-mist text-ink/70";
  if (t.includes("SAVE") || t.includes("WATCH") || t.includes("ROUTE"))
    return "bg-signal/15 text-signal";
  if (t.includes("VIEW") || t === "LISTING_VIEW") return "bg-mist text-ink/65";
  if (t.includes("LEAD") || t.includes("CLAIM") || t.includes("STATUS"))
    return "bg-ink/10 text-ink";
  return "bg-mist/80 text-ink/60";
}

function isListingRow(item: TimelineItem) {
  return Boolean(item.mlsNumber);
}

export function CrmTimeline({
  items,
  empty = "No activity yet.",
}: {
  items: TimelineItem[];
  empty?: string;
}) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink/50">
        {empty}
      </p>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-line/80 pl-5">
      {items.map((item, index) => {
        const listingHref = item.mlsNumber
          ? `/listing/${item.mlsNumber}`
          : item.path;
        const showListingCard = isListingRow(item);

        return (
          <li key={item.id} className="relative pb-5 last:pb-0">
            <span
              className={cn(
                "absolute -left-[1.4rem] top-1 size-2.5 rounded-full ring-4 ring-surface",
                index === 0 ? "bg-canopy" : "bg-ink/25",
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                  tone(item.type),
                )}
              >
                {item.type === "contact_update_request"
                  ? "Contact update requested"
                  : item.type === "contact_updated_by_customer"
                    ? "Contact updated by customer"
                    : item.type === "contact_update"
                      ? "Contact updated"
                      : item.type.replaceAll("_", " ")}
              </span>
              <time className="text-xs text-ink/45">
                {item.createdAt.toLocaleString("en-CA", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
            </div>

            {showListingCard ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-line/90 bg-gradient-to-br from-mist/40 via-surface to-surface shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                {listingHref ? (
                  <Link
                    href={listingHref}
                    className="group flex gap-3 p-2.5 transition hover:bg-mist/35"
                  >
                    <ListingCover imageUrl={item.imageUrl} title={item.title} />
                    <div className="min-w-0 flex-1 self-center py-0.5">
                      <p className="text-sm font-semibold leading-snug text-ink group-hover:text-canopy-deep">
                        {item.title}
                      </p>
                      {item.path ? (
                        <p className="mt-0.5 truncate text-xs text-ink/45">
                          {item.path}
                        </p>
                      ) : null}
                      {item.body && item.body !== item.path ? (
                        <p className="mt-1 text-xs text-ink/55 line-clamp-2">
                          {item.body}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-xs font-semibold text-canopy underline-offset-2 group-hover:underline">
                        {item.mlsNumber}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <div className="flex gap-3 p-2.5">
                    <ListingCover imageUrl={item.imageUrl} title={item.title} />
                    <div className="min-w-0 flex-1 self-center py-0.5">
                      <p className="text-sm font-semibold leading-snug text-ink">
                        {item.title}
                      </p>
                      {item.mlsNumber ? (
                        <p className="mt-1.5 text-xs font-semibold text-canopy">
                          {item.mlsNumber}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium text-ink">{item.title}</p>
                {item.body ? (
                  <p className="mt-0.5 text-xs text-ink/55 line-clamp-3">
                    {item.body}
                  </p>
                ) : null}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ListingCover({
  imageUrl,
  title,
}: {
  imageUrl: string | null;
  title: string;
}) {
  return (
    <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-ink/[0.06] ring-1 ring-ink/10 sm:size-[5.25rem]">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={title}
          fill
          sizes="84px"
          className="object-cover transition duration-300 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,#e8eef2_0%,#d5dde4_55%,#c7d0d8_100%)]">
          <span className="text-[10px] font-semibold tracking-wide text-ink/35">
            No photo
          </span>
        </div>
      )}
    </div>
  );
}
