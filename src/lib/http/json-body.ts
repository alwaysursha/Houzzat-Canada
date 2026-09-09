export type JsonParseOutcome<T> =
  | { parse: "ok"; data: T }
  | { parse: "empty"; data: null }
  | { parse: "invalid"; data: null };

export function parseJsonText<T>(text: string): JsonParseOutcome<T> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { parse: "empty", data: null };
  }
  try {
    return { parse: "ok", data: JSON.parse(trimmed) as T };
  } catch {
    return { parse: "invalid", data: null };
  }
}

export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
