import type { ActivityEvent, ActivityEventType } from "@prisma/client";
import { formatActivityLabel } from "@/lib/admin/activity";
import { cn } from "@/lib/utils";

type EventRow = Pick<
  ActivityEvent,
  | "id"
  | "type"
  | "path"
  | "title"
  | "mlsNumber"
  | "referrer"
  | "utmSource"
  | "utmCampaign"
  | "createdAt"
  | "meta"
>;

function toneFor(type: ActivityEventType) {
  switch (type) {
    case "LEAD":
    case "SIGN_UP":
      return "bg-signal/15 text-signal";
    case "SAVE_LISTING":
    case "WATCH_PROPERTY":
    case "WATCH_AREA":
    case "SAVE_SEARCH":
      return "bg-canopy/12 text-canopy-deep";
    case "LISTING_VIEW":
    case "LANDING_VIEW":
      return "bg-mist text-ink/70";
    default:
      return "bg-mist/80 text-ink/60";
  }
}

export function JourneyTimeline({
  events,
  empty = "No journey events yet.",
}: {
  events: EventRow[];
  empty?: string;
}) {
  if (!events.length) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink/50">
        {empty}
      </p>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-line/80 pl-5">
      {events.map((event, index) => (
        <li key={event.id} className="relative pb-6 last:pb-0">
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
                toneFor(event.type),
              )}
            >
              {formatActivityLabel(event.type)}
            </span>
            <time className="text-xs text-ink/45">
              {event.createdAt.toLocaleString("en-CA", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </div>
          <p className="mt-1 text-sm font-medium text-ink">
            {event.title || event.path || event.mlsNumber || "—"}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink/45">
            {event.path ? <span className="truncate">{event.path}</span> : null}
            {event.mlsNumber ? <span>MLS® {event.mlsNumber}</span> : null}
            {event.utmSource ? <span>utm:{event.utmSource}</span> : null}
            {event.utmCampaign ? <span>{event.utmCampaign}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
