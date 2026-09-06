"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { HomeAreaCardData } from "@/lib/geo/home-area-stats";
import { homesForSalePath } from "@/lib/geo/area-paths";
import { formatCommunityDisplayName } from "@/lib/tenancy/templates/format-community-display-name";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";
import { cn } from "@/lib/utils";

function CommunityCard({
  place,
  featured = false,
}: {
  place: HomeAreaCardData;
  featured?: boolean;
}) {
  const label = formatCommunityDisplayName(place.displayName);
  return (
    <Link
      href={homesForSalePath({
        city: place.city,
        community: place.community,
      })}
      className={cn(
        "group relative overflow-hidden bg-ink",
        featured ? "min-h-[22rem] lg:min-h-full" : "aspect-[5/4] sm:aspect-auto sm:min-h-[11rem]",
      )}
    >
      <Image
        src={place.imageUrl}
        alt=""
        fill
        className="object-cover transition duration-700 group-hover:scale-[1.04]"
        sizes={
          featured
            ? "(max-width: 1024px) 100vw, 50vw"
            : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        }
      />
      <div className="absolute inset-0 bg-gradient-to-t from-canopy-deep via-canopy-deep/25 to-transparent transition group-hover:via-canopy-deep/35" />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <p
          className={cn(
            "font-display text-surface",
            featured ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl",
          )}
        >
          {label}
        </p>
        <p className="mt-1 text-sm text-surface/70">{place.city}</p>
      </div>
    </Link>
  );
}

/**
 * Stage 6.11B.5 — editorial Communities: one featured + three supporting.
 */
export function AgentSignatureCommunities({
  agentFirstName,
}: {
  agentFirstName: string;
}) {
  const [places, setPlaces] = useState<HomeAreaCardData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/geo/home-areas", {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setPlaces([]);
          return;
        }
        const data = (await res.json()) as { places?: HomeAreaCardData[] };
        if (cancelled) return;
        const list = Array.isArray(data.places) ? data.places : [];
        setPlaces(list.slice(0, 4));
      } catch {
        if (!cancelled) setPlaces([]);
      }
    }

    const cancelSchedule = scheduleAfterFirstPaint(
      () => {
        if (!cancelled) void load();
      },
      { timeoutMs: 1_400 },
    );

    return () => {
      cancelled = true;
      cancelSchedule();
      controller.abort();
    };
  }, []);

  if (places != null && places.length === 0) return null;

  const featured = places?.[0] ?? null;
  const supporting = places?.slice(1, 4) ?? [];

  return (
    <section
      id="communities"
      className="scroll-mt-28 bg-mist px-4 py-14 sm:px-6 lg:px-10 lg:py-20"
      aria-labelledby="as-communities-heading"
      data-as-section="communities"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">
              Communities
            </p>
            <h2
              id="as-communities-heading"
              className="mt-2 font-display text-3xl tracking-tight text-ink sm:text-4xl"
            >
              Explore Communities
            </h2>
            <p className="mt-3 text-base text-ink/60">
              Neighbourhoods where {agentFirstName} helps clients buy and sell
              with confidence.
            </p>
          </div>
          <Link
            href="/areas"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-ink underline-offset-4 hover:underline"
          >
            All communities →
          </Link>
        </div>

        {places == null ? (
          <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-5">
            <div className="min-h-[22rem] animate-pulse bg-line/50" aria-hidden />
            <div className="grid gap-4 sm:grid-cols-1" aria-hidden>
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="min-h-[11rem] animate-pulse bg-line/40" />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-5">
            {featured ? <CommunityCard place={featured} featured /> : null}
            <div className="grid gap-4">
              {supporting.map((place) => (
                <CommunityCard key={place.slug} place={place} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
