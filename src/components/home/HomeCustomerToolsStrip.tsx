"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import {
  NotesMenuButton,
  SavedHomesMenuButton,
  WatchlistMenuButton,
} from "@/components/account/CustomerToolsMenus";
import { SavedSearchesMenuButton } from "@/components/account/SavedSearchesMenuButton";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { PersonalizeHomepageButton } from "@/components/home/PersonalizeHomepageButton";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { Input } from "@/components/ui/input";
import { parseHomepagePersonalizationQuery } from "@/lib/listings/homepage-personalization";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

type ActiveSearch = {
  id: string;
  name: string;
  query: Record<string, unknown>;
  emailAlerts: boolean;
};

function queryToSearchParams(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function HomeCustomerToolsStrip({
  unreadAlerts,
  cities = [],
}: {
  savedCount?: number;
  noteCount?: number;
  propertyWatchCount?: number;
  areaWatchCount?: number;
  unreadAlerts: number;
  cities?: string[];
}) {
  const router = useRouter();
  const { confirm, toast } = useSiteAlert();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [activeSearch, setActiveSearch] = useState<ActiveSearch | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameMode, setRenameMode] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadActive = useCallback(async () => {
    const res = await fetch("/api/saved-searches");
    if (!res.ok) {
      setActiveSearch(null);
      return;
    }
    const json = (await res.json()) as {
      items?: Array<{
        id: string;
        name: string;
        query: Record<string, unknown>;
        emailAlerts?: boolean;
        isHomepageActive?: boolean;
      }>;
    };
    const current =
      json.items?.find((item) => item.isHomepageActive) ?? null;
    setActiveSearch(
      current
        ? {
            id: current.id,
            name: current.name,
            query: current.query ?? {},
            emailAlerts: Boolean(current.emailAlerts),
          }
        : null,
    );
  }, []);

  useEffect(() => {
    void loadActive();
    const onChange = () => void loadActive();
    window.addEventListener("houzzat:saved-searches-changed", onChange);
    window.addEventListener("houzzat:homepage-personalization-changed", onChange);
    return () => {
      window.removeEventListener("houzzat:saved-searches-changed", onChange);
      window.removeEventListener(
        "houzzat:homepage-personalization-changed",
        onChange,
      );
    };
  }, [loadActive]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    let observer: IntersectionObserver | null = null;

    function stackPx() {
      const raw =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--site-header-stack")
          .trim() || "4rem";
      if (raw.endsWith("rem")) return parseFloat(raw) * 16;
      if (raw.endsWith("px")) return parseFloat(raw);
      return 64;
    }

    function bind() {
      observer?.disconnect();
      const px = stackPx();
      observer = new IntersectionObserver(
        ([entry]) => {
          setStuck(!entry?.isIntersecting);
        },
        { rootMargin: `-${px}px 0px 0px 0px`, threshold: 0 },
      );
      observer.observe(el!);
    }

    bind();
    const mo = new MutationObserver(bind);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-mobile-search-visible"],
    });
    return () => {
      mo.disconnect();
      observer?.disconnect();
    };
  }, []);

  async function patch(data: { name?: string; emailAlerts?: boolean }) {
    if (!activeSearch) return;
    const res = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeSearch.id, ...data }),
    });
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    await loadActive();
  }

  async function removeSearch() {
    if (!activeSearch) return;
    const ok = await confirm({
      ...SITE_MESSAGES.deleteSavedSearch,
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch("/api/saved-searches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeSearch.id }),
    });
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    setMenuOpen(false);
    toast({ message: "Saved search deleted.", tone: "success" });
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    router.refresh();
  }

  async function clearCustomSearch() {
    if (!activeSearch) return;
    const ok = await confirm({
      ...SITE_MESSAGES.clearHomepageSearch,
    });
    if (!ok) return;

    setClearing(true);
    const res = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeSearch.id, isHomepageActive: false }),
    });
    setClearing(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    toast({ message: "Homepage now shows all listings.", tone: "success" });
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    router.refresh();
  }

  const customized = Boolean(activeSearch);
  const searchHref = activeSearch
    ? `/search?${queryToSearchParams(activeSearch.query)}`
    : "/search";

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden />
      <div
        className={cn(
          "sticky top-[var(--site-header-stack,4rem)] z-30 transition-[box-shadow,background-color,border-color,top] duration-300",
          stuck
            ? "border-b border-canopy/20 bg-mist pt-2 shadow-[0_8px_24px_-12px_rgba(15,107,76,0.35)]"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full px-4 transition-[padding] duration-300 sm:px-6 lg:px-10",
            stuck ? "py-2.5" : "py-3",
          )}
        >
          <div
            className={cn(
              "relative overflow-visible rounded-2xl border transition duration-300",
              stuck
                ? "border-canopy/25 bg-surface shadow-none"
                : "border-canopy/15 bg-gradient-to-r from-canopy/[0.07] via-surface to-surface shadow-[0_1px_0_rgba(15,107,76,0.06)]",
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-canopy" />
            </div>
            <div className="relative z-10 flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
              <div
                className={cn(
                  "min-w-0 flex-wrap items-center gap-2",
                  customized ? "flex justify-center sm:justify-start" : "hidden md:flex",
                )}
              >
                <p className="font-display text-lg tracking-tight text-ink">
                  {customized
                    ? "Custom Search"
                    : "Your Houzzat"}
                </p>
                {customized && activeSearch ? (
                  <>
                    <div className="relative z-30 shrink-0">
                      <div className="flex items-center overflow-hidden rounded-full border border-signal/30 bg-surface shadow-sm">
                        <Link
                          href={searchHref}
                          className="max-w-[11rem] truncate px-3 py-1.5 text-xs font-semibold text-ink/85 hover:text-signal"
                          title={activeSearch.name}
                        >
                          {activeSearch.name}
                        </Link>
                        <button
                          type="button"
                          className="border-l border-signal/20 px-2 py-1.5 text-signal hover:bg-signal/10"
                          aria-label={`Edit ${activeSearch.name}`}
                          onClick={() => {
                            setMenuOpen((open) => !open);
                            setRenameMode(false);
                          }}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={clearing}
                          className="border-l border-signal/20 px-2 py-1.5 text-danger hover:bg-danger/10 disabled:opacity-60 sm:hidden"
                          aria-label="Clear custom search"
                          onClick={() => void clearCustomSearch()}
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                      </div>
                      {menuOpen ? (
                        <div className="absolute left-0 top-full z-[80] mt-1 w-56 rounded-xl border border-line bg-surface p-3 shadow-lg">
                          {renameMode ? (
                            <div className="space-y-2">
                              <Input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="h-8 text-xs"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-canopy"
                                  onClick={() => {
                                    void patch({ name: renameValue }).then(() => {
                                      setRenameMode(false);
                                      setMenuOpen(false);
                                    });
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="text-xs text-ink/50"
                                  onClick={() => setRenameMode(false)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <ul className="space-y-1 text-xs">
                              <li>
                                <button
                                  type="button"
                                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-mist"
                                  onClick={() => {
                                    setEditOpen(true);
                                    setMenuOpen(false);
                                  }}
                                >
                                  Open & edit filters
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-mist"
                                  onClick={() => {
                                    setRenameMode(true);
                                    setRenameValue(activeSearch.name);
                                  }}
                                >
                                  Rename
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-mist"
                                  onClick={() => {
                                    void patch({
                                      emailAlerts: !activeSearch.emailAlerts,
                                    }).then(() => setMenuOpen(false));
                                  }}
                                >
                                  {activeSearch.emailAlerts
                                    ? "Turn off email alerts"
                                    : "Turn on email alerts"}
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  className="w-full rounded-lg px-2 py-1.5 text-left text-danger hover:bg-mist"
                                  onClick={() => void removeSearch()}
                                >
                                  Delete
                                </button>
                              </li>
                            </ul>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={clearing}
                      onClick={() => void clearCustomSearch()}
                      className="hidden text-xs font-semibold text-canopy hover:underline disabled:opacity-60 sm:inline"
                    >
                      Clear custom search
                    </button>
                  </>
                ) : null}
                {!customized && unreadAlerts > 0 ? (
                  <span className="rounded-md bg-signal/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-signal">
                    {unreadAlerts} new
                  </span>
                ) : null}
              </div>

              <div className="-mx-1 flex min-w-0 w-full gap-2 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:w-auto sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0">
                <div className="flex w-max shrink-0 gap-2 sm:w-auto sm:flex-wrap sm:justify-end">
                  <PersonalizeHomepageButton cities={cities} variant="tools" />
                  <SavedSearchesMenuButton cities={cities} />
                  <SavedHomesMenuButton />
                  <WatchlistMenuButton />
                  <NotesMenuButton />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PersonalizeHomepageModal
        open={editOpen && Boolean(activeSearch)}
        onClose={() => setEditOpen(false)}
        cities={cities}
        searchId={activeSearch?.id}
        initial={
          activeSearch
            ? {
                name: activeSearch.name,
                ...parseHomepagePersonalizationQuery(activeSearch.query),
              }
            : undefined
        }
      />
    </>
  );
}
