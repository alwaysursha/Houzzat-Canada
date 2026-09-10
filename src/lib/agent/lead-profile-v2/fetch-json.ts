import { readJsonResponse } from "@/lib/http/fetch-json";
import { isV2AbortError } from "@/lib/agent/lead-profile-v2/request-gate";

export async function fetchV2Json<T>(
  url: string,
  route: string,
  signal?: AbortSignal,
): Promise<T> {
  const startedAt = performance.now();
  let res: Response;
  try {
    res = await fetch(url, signal ? { signal } : undefined);
  } catch (error) {
    if (isV2AbortError(error) || signal?.aborted) {
      throw error;
    }
    throw new Error("Failed to load");
  }
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const read = await readJsonResponse<T & { error?: string }>(res, {
    route,
    method: "GET",
    startedAt,
  });
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!read.ok) {
    throw new Error("Failed to load");
  }
  if (!res.ok) {
    throw new Error(read.data.error || "Failed to load");
  }
  return read.data;
}
