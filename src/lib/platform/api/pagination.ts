export const DEFAULT_PLATFORM_LIST_LIMIT = 25;
export const MAX_PLATFORM_LIST_LIMIT = 100;

export type PlatformListParams = {
  limit: number;
  cursor: string | null;
  status: string | null;
};

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function parsePlatformListParams(
  searchParams: URLSearchParams,
): PlatformListParams {
  const limit = Math.min(
    MAX_PLATFORM_LIST_LIMIT,
    parsePositiveInt(
      searchParams.get("limit"),
      DEFAULT_PLATFORM_LIST_LIMIT,
    ),
  );
  const cursor = searchParams.get("cursor")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  return { limit, cursor, status };
}

export function buildCursorPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;
  return { items, nextCursor };
}
