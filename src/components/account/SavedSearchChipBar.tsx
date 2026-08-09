"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Input } from "@/components/ui/input";
import { parseHomepagePersonalizationQuery } from "@/lib/listings/homepage-personalization";
import { SITE_MESSAGES } from "@/lib/site-messages";

type SavedSearchItem = {
  id: string;
  name: string;
  query: Record<string, unknown>;
  emailAlerts: boolean;
  isHomepageActive?: boolean;
};

function queryToSearchParams(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

function hintFromQuery(query: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof query.city === "string" && query.city) parts.push(query.city);
  if (typeof query.community === "string" && query.community) {
    parts.push(query.community);
  }
  if (query.transactionType === "LEASE") parts.push("Lease");
  else if (query.transactionType === "SALE") parts.push("Sale");
  if (typeof query.minBeds === "string" && query.minBeds) {
    parts.push(`${query.minBeds}+ beds`);
  }
  return parts.slice(0, 3).join(" · ");
}

export function SavedSearchChipBar({
  forceShow = false,
  cities = [],
}: {
  /** When true, render even on listing detail (listing page places it above gallery). */
  forceShow?: boolean;
  cities?: string[];
}) {
  const { status, data } = useSession();
  const role = data?.user?.role;
  const pathname = usePathname();
  const [items, setItems] = useState<SavedSearchItem[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editSearch, setEditSearch] = useState<SavedSearchItem | null>(null);
  const { confirm, toast } = useSiteAlert();

  const load = useCallback(async () => {
    const res = await fetch("/api/saved-searches");
    if (!res.ok) return;
    const json = (await res.json()) as { items: SavedSearchItem[] };
    setItems(json.items ?? []);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (role === "ADMIN" || role === "AGENT") return;
    void load();
    const onChange = () => void load();
    window.addEventListener("houzzat:saved-searches-changed", onChange);
    window.addEventListener("houzzat:homepage-personalization-changed", onChange);
    return () => {
      window.removeEventListener("houzzat:saved-searches-changed", onChange);
      window.removeEventListener(
        "houzzat:homepage-personalization-changed",
        onChange,
      );
    };
  }, [status, role, load]);

  const homepageActive = items.some((item) => item.isHomepageActive);

  if (
    status !== "authenticated" ||
    role === "ADMIN" ||
    role === "AGENT" ||
    items.length === 0 ||
    !homepageActive
  ) {
    return null;
  }

  // Hide on account desk pages that already list searches heavily
  if (pathname.startsWith("/account/searches")) {
    return null;
  }

  // Homepage places this bar above Popular Cities instead.
  if (!forceShow && pathname === "/") {
    return null;
  }

  // Listing detail places this bar above the gallery instead.
  if (!forceShow && pathname.startsWith("/listing/")) {
    return null;
  }

  async function patch(
    id: string,
    data: { name?: string; emailAlerts?: boolean },
  ) {
    const res = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    if (res.ok) await load();
  }

  async function remove(id: string) {
    const ok = await confirm({
      ...SITE_MESSAGES.deleteSavedSearch,
      destructive: true,
    });
    if (!ok) return;

    const res = await fetch("/api/saved-searches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    setMenuId(null);
    toast({ message: "Saved search deleted.", tone: "success" });
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    await load();
  }

  const editInitial = editSearch
    ? {
        name: editSearch.name,
        ...parseHomepagePersonalizationQuery(editSearch.query),
      }
    : undefined;

  return (
    <>
      {/* Mobile: account tools live in MobileBottomNav → More. */}
      <div className="relative z-20 hidden border-b border-signal/25 bg-signal/[0.07] md:block">
        <div
          className={
            menuId
              ? "flex items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-10"
              : "flex items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-10"
          }
        >
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-signal">
            Searches
          </span>
          {items.map((item) => {
            const hint = hintFromQuery(item.query ?? {});
            const href = `/search?${queryToSearchParams(item.query ?? {})}`;
            const open = menuId === item.id;
            return (
              <div key={item.id} className="relative z-10 shrink-0">
                <div className="flex items-center overflow-hidden rounded-full border border-signal/30 bg-surface shadow-sm">
                  <Link
                    href={href}
                    className="max-w-[11rem] truncate px-3 py-1.5 text-xs font-semibold text-ink/85 hover:text-signal"
                    title={hint || item.name}
                  >
                    {item.name}
                    {hint ? (
                      <span className="font-normal text-ink/45"> · {hint}</span>
                    ) : null}
                  </Link>
                  <button
                    type="button"
                    className="border-l border-signal/20 px-2 py-1.5 text-signal hover:bg-signal/10"
                    aria-label={`Edit ${item.name}`}
                    onClick={() =>
                      setMenuId((cur) => (cur === item.id ? null : item.id))
                    }
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
                {open ? (
                  <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-line bg-surface p-3 shadow-lg">
                    {renameId === item.id ? (
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
                              void patch(item.id, { name: renameValue }).then(
                                () => {
                                  setRenameId(null);
                                  setMenuId(null);
                                },
                              );
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="text-xs text-ink/50"
                            onClick={() => setRenameId(null)}
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
                              setEditSearch(item);
                              setMenuId(null);
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
                              setRenameId(item.id);
                              setRenameValue(item.name);
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
                              void patch(item.id, {
                                emailAlerts: !item.emailAlerts,
                              }).then(() => setMenuId(null));
                            }}
                          >
                            {item.emailAlerts
                              ? "Turn off email alerts"
                              : "Turn on email alerts"}
                          </button>
                        </li>
                        <li>
                          <button
                            type="button"
                            className="w-full rounded-lg px-2 py-1.5 text-left text-danger hover:bg-mist"
                            onClick={() => void remove(item.id)}
                          >
                            Delete
                          </button>
                        </li>
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <PersonalizeHomepageModal
        open={Boolean(editSearch)}
        onClose={() => setEditSearch(null)}
        cities={cities}
        searchId={editSearch?.id}
        initial={editInitial}
      />
    </>
  );
}
