"use client";

import { useEffect, useState } from "react";
import { ListingRoomsPanel } from "@/components/listings/ListingRoomsPanel";

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

type OpenHouseRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
};

type ExtrasPayload = {
  rooms: RoomRow[];
  openHouses: OpenHouseRow[];
};

type InflightExtras = {
  promise: Promise<ExtrasPayload>;
  controller: AbortController;
  subscribers: number;
};

const inflight = new Map<string, InflightExtras>();

async function fetchListingExtras(
  mlsNumber: string,
  signal?: AbortSignal,
): Promise<ExtrasPayload> {
  const key = mlsNumber.trim().toUpperCase();
  if (signal?.aborted) return { rooms: [], openHouses: [] };

  const existing = inflight.get(key);
  if (existing) {
    existing.subscribers += 1;
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          existing.subscribers -= 1;
          if (existing.subscribers <= 0) existing.controller.abort();
        },
        { once: true },
      );
    }
    return existing.promise;
  }

  const controller = new AbortController();
  const request = (async () => {
    try {
      const res = await fetch(
        `/api/listings/${encodeURIComponent(key)}/rooms-open-houses`,
        { credentials: "same-origin", signal: controller.signal },
      );
      if (!res.ok) return { rooms: [], openHouses: [] };
      const data = (await res.json()) as {
        rooms?: RoomRow[];
        openHouses?: OpenHouseRow[];
      };
      return {
        rooms: Array.isArray(data.rooms) ? data.rooms : [],
        openHouses: Array.isArray(data.openHouses) ? data.openHouses : [],
      };
    } catch {
      return { rooms: [], openHouses: [] };
    } finally {
      inflight.delete(key);
    }
  })();

  const entry: InflightExtras = {
    promise: request,
    controller,
    subscribers: 1,
  };
  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        entry.subscribers -= 1;
        if (entry.subscribers <= 0) controller.abort();
      },
      { once: true },
    );
  }
  inflight.set(key, entry);
  return request;
}

function useListingExtras(mlsNumber: string) {
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [openHouses, setOpenHouses] = useState<OpenHouseRow[] | null>(null);

  useEffect(() => {
    const mls = mlsNumber.trim().toUpperCase();
    if (!mls) return;
    let cancelled = false;
    const controller = new AbortController();
    void fetchListingExtras(mls, controller.signal).then((data) => {
      if (cancelled) return;
      setRooms(data.rooms);
      setOpenHouses(data.openHouses);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mlsNumber]);

  return { rooms, openHouses };
}

/** Rooms panel — loaded after paint (omitted from lean SSR). */
export function ListingRoomsLive({ mlsNumber }: { mlsNumber: string }) {
  const { rooms } = useListingExtras(mlsNumber);
  if (!rooms || rooms.length === 0) return null;
  return <ListingRoomsPanel rooms={rooms} />;
}

/** Open houses — loaded after paint (omitted from lean SSR). */
export function ListingOpenHousesLive({ mlsNumber }: { mlsNumber: string }) {
  const { openHouses } = useListingExtras(mlsNumber);
  if (!openHouses || openHouses.length === 0) return null;

  return (
    <section
      id="listing-open-houses"
      className="scroll-mt-[calc(var(--site-header-stack,4rem)+3.25rem)] rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-6"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
        Showings
      </p>
      <h2 className="mt-1 font-display text-xl text-ink sm:text-2xl">
        Open houses
      </h2>
      <ul className="mt-4 space-y-2">
        {openHouses.map((oh) => (
          <li
            key={oh.id}
            className="rounded-xl border border-signal/20 bg-signal/5 px-4 py-3 text-sm font-medium text-ink/80"
          >
            {new Date(oh.startsAt).toLocaleString("en-CA", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            –{" "}
            {new Date(oh.endsAt).toLocaleTimeString("en-CA", {
              hour: "numeric",
              minute: "2-digit",
            })}
            {oh.notes ? ` · ${oh.notes}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
