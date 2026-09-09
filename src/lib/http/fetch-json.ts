import { HOUZZAT_REQUEST_ID_HEADER } from "@/lib/http/api-headers";
import { parseJsonText } from "@/lib/http/json-body";

export type JsonReadResult<T> =
  | {
      ok: true;
      res: Response;
      data: T;
      bodyLength: number;
    }
  | {
      ok: false;
      res: Response;
      data: null;
      bodyLength: number;
      reason: "empty" | "invalid";
    };

function headerOrNull(res: Response, name: string): string | null {
  return res.headers.get(name);
}

/**
 * Read a fetch Response as JSON via text() + JSON.parse.
 * Never calls Response.json() (empty/truncated bodies throw a browser TypeError).
 * Does not retry.
 */
export async function readJsonResponse<T>(
  res: Response,
  meta: { route: string; method: string; startedAt: number },
): Promise<JsonReadResult<T>> {
  const text = await res.text();
  const bodyLength = text.length;
  const parsed = parseJsonText<T>(text);
  const durationMs = Math.round(performance.now() - meta.startedAt);

  console.info(
    [
      `[${meta.route}]`,
      meta.method,
      `id=${headerOrNull(res, HOUZZAT_REQUEST_ID_HEADER) ?? "none"}`,
      `status=${res.status}`,
      `content-type=${headerOrNull(res, "content-type") ?? "none"}`,
      `content-length=${headerOrNull(res, "content-length") ?? "none"}`,
      `cf-ray=${headerOrNull(res, "cf-ray") ?? "none"}`,
      `body=${bodyLength}`,
      `parse=${parsed.parse}`,
      `ms=${durationMs}`,
    ].join(" "),
  );

  if (parsed.parse !== "ok") {
    return {
      ok: false,
      res,
      data: null,
      bodyLength,
      reason: parsed.parse,
    };
  }

  return { ok: true, res, data: parsed.data, bodyLength };
}
