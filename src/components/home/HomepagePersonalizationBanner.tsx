"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import {
  parseHomepagePersonalizationQuery,
} from "@/lib/listings/homepage-personalization";

type ActiveSearch = {
  id: string;
  name: string;
  query: unknown;
};

export function HomepagePersonalizationBanner({
  cities = [],
  /** When true, render even on listing detail (listing page places it above gallery). */
  forceShow = false,
}: {
  cities?: string[];
  forceShow?: boolean;
}) {
  const { status, data } = useSession();
  const role = data?.user?.role;
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState<ActiveSearch | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (status !== "authenticated") {
      setActive(null);
      return;
    }
    if (role === "ADMIN" || role === "AGENT") {
      setActive(null);
      return;
    }
    const res = await fetch("/api/saved-searches");
    if (!res.ok) return;
    const json = (await res.json()) as {
      items?: Array<{
        id: string;
        name: string;
        query: unknown;
        isHomepageActive?: boolean;
      }>;
    };
    const current =
      json.items?.find((item) => item.isHomepageActive) ?? null;
    setActive(
      current
        ? { id: current.id, name: current.name, query: current.query }
        : null,
    );
  }, [status, role]);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener("houzzat:homepage-personalization-changed", onChange);
    window.addEventListener("houzzat:saved-searches-changed", onChange);
    return () => {
      window.removeEventListener(
        "houzzat:homepage-personalization-changed",
        onChange,
      );
      window.removeEventListener("houzzat:saved-searches-changed", onChange);
    };
  }, [load]);

  async function showAllListings() {
    if (!active) return;
    setPending(true);
    await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, isHomepageActive: false }),
    });
    setPending(false);
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    router.refresh();
  }

  // Homepage places this banner above Popular Cities instead.
  if (!forceShow && pathname === "/") {
    return null;
  }

  // Listing detail places this banner above the gallery instead.
  if (!forceShow && pathname.startsWith("/listing/")) {
    return null;
  }

  if (status !== "authenticated" || role === "ADMIN" || role === "AGENT") {
    return null;
  }

  if (!active) return null;

  return (
    <>
      <div className="relative overflow-hidden border-b border-canopy-deep bg-canopy text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 120% at 100% 0%, #fff 0%, transparent 55%), linear-gradient(90deg, transparent 0%, rgb(10 77 56 / 0.35) 100%)",
          }}
        />
        <div className="relative flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 lg:px-10">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
              Personalized view
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">
              Custom Search Name · {active.name}
            </p>
            <p className="mt-1 text-xs text-white/75">
              Only listings matching your saved search — not all of the
              listings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setModalOpen(true)}
              className="rounded-lg border border-white/45 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Modify Search
            </button>
            <Link
              href="/account/searches"
              className="rounded-lg border border-white/45 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Manage searches
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => void showAllListings()}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-canopy-deep transition hover:bg-mist"
            >
              {pending ? "Restoring…" : "Show all listings"}
            </button>
          </div>
        </div>
      </div>
      <PersonalizeHomepageModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cities={cities}
        searchId={active.id}
        initial={{
          name: active.name,
          ...parseHomepagePersonalizationQuery(active.query),
        }}
      />
    </>
  );
}
