"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { HomeAreaCardData } from "@/lib/geo/home-area-stats";
import { homesForSalePath } from "@/lib/geo/area-paths";
import { formatCommunityDisplayName } from "@/lib/tenancy/templates/format-community-display-name";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";
import { cn } from "@/lib/utils";

function CommunityTile({
  place,
  featured = false,
  className,
}: {
  place: HomeAreaCardData;
  featured?: boolean;
  className?: string;
}) {
  const label = formatCommunityDisplayName(place.displayName);
  return (
    <Link
      href={homesForSalePath({
        city: place.city,
        community: place.community,
      })}
      className={cn(
        "group relative overflow-hidden bg-[var(--ts-ink,#0F6B4C)]",
        featured ? "min-h-[16rem] sm:min-h-[20rem] lg:min-h-full" : "aspect-[16/10]",
        className,
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
            : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        }
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-ink-deep,#0A4D38)] via-[var(--ts-ink-deep,#0A4D38)]/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <p
          className={cn(
            "font-display text-surface",
            featured ? "text-3xl sm:text-4xl" : "text-2xl",
          )}
        >
          {label}
        </p>
        <p className="mt-1 text-sm text-surface/70">{place.city}</p>
      </div>
    </Link>
  );
}

function CommunitiesGrid({ places }: { places: HomeAreaCardData[] }) {
  const n = places.length;

  if (n === 5) {
    const [featured, ...rest] = places;
    return (
      <div
        className="mt-10 grid gap-4 lg:grid-cols-2 lg:gap-5"
        data-ts-communities-layout="featured-plus-four"
      >
        <CommunityTile place={featured!} featured />
        <div className="grid gap-4 sm:grid-cols-2">
          {rest.map((place) => (
            <CommunityTile key={place.slug} place={place} />
          ))}
        </div>
      </div>
    );
  }

  const className =
    n <= 1
      ? "mt-10 grid gap-4"
      : n === 2
        ? "mt-10 grid gap-4 sm:grid-cols-2"
        : n === 3
          ? "mt-10 grid gap-4 sm:grid-cols-3"
          : n === 4
            ? "mt-10 grid gap-4 sm:grid-cols-2"
            : "mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div
      className={className}
      data-ts-communities-layout={`equal-${n}`}
    >
      {places.map((place) => (
        <CommunityTile key={place.slug} place={place} />
      ))}
    </div>
  );
}

/**
 * Stage 6.11E.2A — adaptive communities grid by result count.
 */
export function TeamSignatureCommunities() {
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
        setPlaces(list.slice(0, 6));
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

  return (
    <section
      id="communities"
      className="scroll-mt-32 bg-[var(--ts-surface,#EEF3F0)] px-4 py-14 sm:px-6 lg:px-10 lg:py-20"
      aria-labelledby="ts-communities-heading"
      data-ts-section="communities"
      data-ts-communities-count={places ? String(places.length) : "loading"}
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ts-ink,#0F6B4C)]/45">
              Areas we serve
            </p>
            <h2
              id="ts-communities-heading"
              className="mt-2 font-display text-3xl tracking-tight text-[var(--ts-ink,#0F6B4C)] sm:text-4xl"
            >
              Local market expertise
            </h2>
            <p className="mt-3 text-base text-[var(--ts-ink,#0F6B4C)]/60">
              Neighbourhoods and cities where our team helps clients buy and
              sell with confidence.
            </p>
          </div>
          <Link
            href="/areas"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ts-ink,#0F6B4C)] underline-offset-4 hover:underline"
          >
            All communities →
          </Link>
        </div>

        {places == null ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="aspect-[16/10] animate-pulse bg-[var(--ts-surface-muted,#EEF3F0)]"
                aria-hidden
              />
            ))}
          </div>
        ) : (
          <CommunitiesGrid places={places} />
        )}
      </div>
    </section>
  );
}
