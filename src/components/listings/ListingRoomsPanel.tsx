type RoomRow = {
  id: string;
  roomType: string;
  roomLevel: string | null;
  dimensions: string | null;
  length: number | null;
  width: number | null;
  units: string | null;
  features: string | null;
  sortOrder: number;
};

function formatSize(room: RoomRow): string | null {
  if (room.dimensions?.trim()) return room.dimensions.trim();
  if (room.length != null && room.width != null) {
    const units = room.units?.trim();
    return `${room.length} × ${room.width}${units ? ` ${units}` : ""}`;
  }
  return null;
}

export function ListingRoomsPanel({ rooms }: { rooms: RoomRow[] }) {
  if (!rooms.length) return null;

  const byLevel = new Map<string, RoomRow[]>();
  for (const room of rooms) {
    const level = room.roomLevel?.trim() || "Other";
    const list = byLevel.get(level) ?? [];
    list.push(room);
    byLevel.set(level, list);
  }

  const levels = [...byLevel.keys()].sort((a, b) => {
    const order = ["Upper", "Main", "Ground", "Lower", "Basement", "Other"];
    const ai = order.findIndex((x) => a.toLowerCase().includes(x.toLowerCase()));
    const bi = order.findIndex((x) => b.toLowerCase().includes(x.toLowerCase()));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <section className="space-y-4" aria-label="Rooms">
      <h2 className="text-lg font-semibold text-ink">Rooms</h2>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="hidden grid-cols-[1.1fr_0.8fr_1fr_1.2fr] gap-3 border-b border-line bg-mist/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink/45 sm:grid">
          <span>Room</span>
          <span>Level</span>
          <span>Size</span>
          <span>Features</span>
        </div>
        <ul className="divide-y divide-line">
          {levels.flatMap((level) =>
            (byLevel.get(level) ?? []).map((room) => {
              const size = formatSize(room);
              return (
                <li
                  key={room.id}
                  className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1.1fr_0.8fr_1fr_1.2fr] sm:items-center sm:gap-3"
                >
                  <p className="font-semibold text-ink">{room.roomType}</p>
                  <p className="text-ink/65">
                    <span className="sm:hidden">Level: </span>
                    {room.roomLevel || "—"}
                  </p>
                  <p className="text-ink/65">
                    <span className="sm:hidden">Size: </span>
                    {size || "—"}
                  </p>
                  <p className="text-ink/65">
                    <span className="sm:hidden">Features: </span>
                    {room.features || "—"}
                  </p>
                </li>
              );
            }),
          )}
        </ul>
      </div>
    </section>
  );
}
