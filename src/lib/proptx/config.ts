/** PropTx / RESO env helpers — secrets never logged. */

export type PropTxConfig = {
  endpointUrl: string;
  bearerToken: string;
  tokenId: string;
  /** Header name for Token ID (PropTx portal may differ). */
  tokenIdHeader: string;
  feed: "vow" | "idx";
};

export function getPropTxConfig(): PropTxConfig | null {
  const endpointUrl = process.env.PROPTX_ENDPOINT_URL?.trim();
  const bearerToken = process.env.PROPTX_BEARER_TOKEN?.trim();
  const tokenId = process.env.PROPTX_TOKEN_ID?.trim();
  if (!endpointUrl || !bearerToken || !tokenId) return null;

  const feedRaw = process.env.PROPTX_FEED?.trim().toLowerCase();
  const feed = feedRaw === "idx" ? "idx" : "vow";
  const tokenIdHeader =
    process.env.PROPTX_TOKEN_ID_HEADER?.trim() || "TokenId";

  return {
    endpointUrl: endpointUrl.replace(/\/+$/, ""),
    bearerToken,
    tokenId,
    tokenIdHeader,
    feed,
  };
}

export function isPropTxConfigured(): boolean {
  return getPropTxConfig() != null;
}

/** Live PropTx serve mode (DB-backed provider). */
export function isPropTxProvider(): boolean {
  return process.env.LISTING_PROVIDER === "proptx";
}

/**
 * VOW-only launch: MLS browse requires a registered client.
 * Active when serving PropTx (or explicitly PROPTX_FEED=vow with proptx).
 */
export function isVowOnlyMlsMode(): boolean {
  if (!isPropTxProvider()) return false;
  const feed = process.env.PROPTX_FEED?.trim().toLowerCase();
  // Default to vow while IDX pending
  return feed !== "idx";
}
