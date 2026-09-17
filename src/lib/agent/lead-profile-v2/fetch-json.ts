import { readJsonResponse } from "@/lib/http/fetch-json";
import { isV2AbortError } from "@/lib/agent/lead-profile-v2/request-gate";

export async function fetchV2Json<T>(
  url: string,
  route: string,
  signal?: AbortSignal,
  init?: RequestInit,
): Promise<T> {
  const startedAt = performance.now();
  const method = init?.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(url, signal ? { ...init, signal } : init);
  } catch (error) {
    if (isV2AbortError(error) || signal?.aborted) {
      throw error;
    }
    throw new Error(method === "GET" ? "Failed to load" : "Failed to send");
  }
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const read = await readJsonResponse<T & { error?: string }>(res, {
    route,
    method,
    startedAt,
  });
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!read.ok) {
    throw new Error(method === "GET" ? "Failed to load" : "Failed to send");
  }
  if (!res.ok) {
    throw new Error(
      read.data.error || (method === "GET" ? "Failed to load" : "Failed to send"),
    );
  }
  return read.data;
}
