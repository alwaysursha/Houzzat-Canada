export function IntentTimeline({
  events,
}: {
  events: {
    id: string;
    type: string;
    body: string | null;
    createdAt: Date | string;
  }[];
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-ink/55">No timeline events yet.</p>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-line pl-6">
      {events.map((event) => (
        <li key={event.id} className="relative pb-6 last:pb-0">
          <span className="absolute -left-[1.55rem] top-1.5 h-2.5 w-2.5 rounded-full bg-canopy" />
          <p className="text-sm font-medium text-ink">
            {event.type.replaceAll("_", " ")}
          </p>
          {event.body ? (
            <p className="mt-0.5 text-sm text-ink/65">{event.body}</p>
          ) : null}
          <p className="mt-1 text-xs text-ink/40">
            {new Date(event.createdAt).toLocaleString("en-CA")}
          </p>
        </li>
      ))}
    </ol>
  );
}
