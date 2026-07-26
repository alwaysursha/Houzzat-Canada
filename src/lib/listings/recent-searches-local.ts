const STORAGE_KEY = "houzzat:recent-searches";
const MAX_ITEMS = 8;

export type LocalRecentSearch = {
  label: string;
  href: string;
  at: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizeLabel(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Collapse equivalent search destinations (case / param order). */
function normalizeHref(href: string) {
  const trimmed = href.trim();
  try {
    const url = new URL(trimmed, "https://houzzat.local");
    const params = new URLSearchParams(url.search);
    const keys = [...params.keys()].sort();
    const normalized = new URLSearchParams();
    for (const key of keys) {
      const value = params.get(key);
      if (value == null || value === "") continue;
      normalized.set(key, value.trim().toLowerCase());
    }
    const qs = normalized.toString();
    return `${url.pathname.toLowerCase()}${qs ? `?${qs}` : ""}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

function isSameSearch(a: LocalRecentSearch, b: LocalRecentSearch) {
  return (
    normalizeLabel(a.label) === normalizeLabel(b.label) ||
    normalizeHref(a.href) === normalizeHref(b.href)
  );
}

function dedupeRecent(items: LocalRecentSearch[]): LocalRecentSearch[] {
  const out: LocalRecentSearch[] = [];
  for (const item of items) {
    if (out.some((existing) => isSameSearch(existing, item))) continue;
    out.push(item);
  }
  return out.slice(0, MAX_ITEMS);
}

export function readLocalRecentSearches(): LocalRecentSearch[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (row): row is LocalRecentSearch =>
        Boolean(
          row &&
            typeof row === "object" &&
            typeof (row as LocalRecentSearch).label === "string" &&
            typeof (row as LocalRecentSearch).href === "string" &&
            typeof (row as LocalRecentSearch).at === "number",
        ),
    );
    const deduped = dedupeRecent(valid);
    // Clean up legacy case-variant duplicates already in storage.
    if (deduped.length !== valid.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
      } catch {
        // ignore
      }
    }
    return deduped;
  } catch {
    return [];
  }
}

export function pushLocalRecentSearch(entry: {
  label: string;
  href: string;
}) {
  if (!canUseStorage()) return;
  const label = entry.label.trim();
  const href = entry.href.trim();
  if (!label || !href) return;

  const next = dedupeRecent([
    { label, href, at: Date.now() },
    ...readLocalRecentSearches(),
  ]);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function clearLocalRecentSearches() {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
