const STORAGE_KEY = "houzzat:recent-views";
const MAX_ITEMS = 40;

export type LocalRecentView = {
  mlsNumber: string;
  viewedAt: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readLocalRecentViews(): LocalRecentView[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is LocalRecentView =>
          Boolean(
            row &&
              typeof row === "object" &&
              typeof (row as LocalRecentView).mlsNumber === "string" &&
              typeof (row as LocalRecentView).viewedAt === "number",
          ),
      )
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function pushLocalRecentView(mlsNumber: string) {
  if (!canUseStorage()) return;
  const cleaned = mlsNumber.trim();
  if (!cleaned) return;

  const next: LocalRecentView[] = [
    { mlsNumber: cleaned, viewedAt: Date.now() },
    ...readLocalRecentViews().filter((row) => row.mlsNumber !== cleaned),
  ].slice(0, MAX_ITEMS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function clearLocalRecentViews() {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function localRecentMlsNumbers(limit = 4): string[] {
  return readLocalRecentViews()
    .map((row) => row.mlsNumber)
    .slice(0, limit);
}
