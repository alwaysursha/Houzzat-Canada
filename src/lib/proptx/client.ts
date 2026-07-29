import { getPropTxSyncConfig, type PropTxConfig } from "@/lib/proptx/config";

export class PropTxError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "PropTxError";
    this.status = status;
    this.body = body;
  }
}

function authHeaders(config: PropTxConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.bearerToken}`,
    [config.tokenIdHeader]: config.tokenId,
    Accept: "application/json",
  };
}

function resolveUrl(config: PropTxConfig, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${config.endpointUrl}${path}`;
}

export async function proptxFetch(
  pathOrUrl: string,
  init: RequestInit = {},
  config: PropTxConfig | null = getPropTxSyncConfig(),
): Promise<Response> {
  if (!config) {
    throw new PropTxError(
      "PropTx credentials not configured (PROPTX_ENDPOINT_URL + IDX Token ID / bearer).",
      0,
      "",
    );
  }

  const headers = new Headers(init.headers);
  const auth = authHeaders(config);
  for (const [key, value] of Object.entries(auth)) {
    if (!headers.has(key)) headers.set(key, value as string);
  }

  const res = await fetch(resolveUrl(config, pathOrUrl), {
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PropTxError(
      `PropTx ${res.status} for ${pathOrUrl}`,
      res.status,
      body.slice(0, 2000),
    );
  }

  return res;
}

export type ODataCollection<T> = {
  value?: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
};

/**
 * Walk OData pages. `path` is relative (e.g. `Property?$top=100`) or absolute nextLink.
 */
export async function* proptxPages<T>(
  path: string,
  options?: {
    maxPages?: number;
    config?: PropTxConfig | null;
  },
): AsyncGenerator<T[], void, unknown> {
  const config = options?.config ?? getPropTxSyncConfig();
  const maxPages = options?.maxPages ?? 50;
  let next: string | null = path;
  let pages = 0;

  while (next && pages < maxPages) {
    const res = await proptxFetch(next, {}, config);
    const data = (await res.json()) as ODataCollection<T>;
    const rows = data.value ?? [];
    yield rows;
    next = data["@odata.nextLink"] ?? null;
    pages += 1;
  }
}

export async function proptxJson<T>(
  path: string,
  config: PropTxConfig | null = getPropTxSyncConfig(),
): Promise<T> {
  const res = await proptxFetch(path, {}, config);
  return (await res.json()) as T;
}
