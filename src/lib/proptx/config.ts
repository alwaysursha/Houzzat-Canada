/** PropTx / RESO env helpers — secrets never logged. */

export type PropTxFeed = "idx" | "vow";

export type PropTxConfig = {
  endpointUrl: string;
  bearerToken: string;
  tokenId: string;
  /** Header name for Token ID (PropTx portal may differ). */
  tokenIdHeader: string;
  /** Which agreement these credentials belong to. */
  feed: PropTxFeed;
};

function tokenIdHeaderName(): string {
  return process.env.PROPTX_TOKEN_ID_HEADER?.trim() || "TokenId";
}

function endpointBase(): string | null {
  const endpointUrl = process.env.PROPTX_ENDPOINT_URL?.trim();
  if (!endpointUrl) return null;
  return endpointUrl.replace(/\/+$/, "");
}

/**
 * IDX credentials — used for visitor-facing MLS inventory.
 * Prefer PROPTX_IDX_* ; fall back to PROPTX_BEARER_TOKEN / PROPTX_TOKEN_ID.
 */
export function getPropTxIdxConfig(): PropTxConfig | null {
  const endpointUrl = endpointBase();
  const bearerToken =
    process.env.PROPTX_IDX_BEARER_TOKEN?.trim() ||
    process.env.PROPTX_BEARER_TOKEN?.trim();
  const tokenId =
    process.env.PROPTX_IDX_TOKEN_ID?.trim() ||
    process.env.PROPTX_TOKEN_ID?.trim();
  if (!endpointUrl || !bearerToken || !tokenId) return null;

  return {
    endpointUrl,
    bearerToken,
    tokenId,
    tokenIdHeader: tokenIdHeaderName(),
    feed: "idx",
  };
}

/**
 * Optional VOW credentials — sold prices / history for registered clients.
 * Set PROPTX_VOW_BEARER_TOKEN + PROPTX_VOW_TOKEN_ID when AMPRE issued a
 * separate VOW Token ID (common when IDX and VOW are separate agreements).
 */
export function getPropTxVowConfig(): PropTxConfig | null {
  const endpointUrl = endpointBase();
  const bearerToken = process.env.PROPTX_VOW_BEARER_TOKEN?.trim();
  const tokenId = process.env.PROPTX_VOW_TOKEN_ID?.trim();
  if (!endpointUrl || !bearerToken || !tokenId) return null;

  return {
    endpointUrl,
    bearerToken,
    tokenId,
    tokenIdHeader: tokenIdHeaderName(),
    feed: "vow",
  };
}

/**
 * Default PropTx client config for sync / photo proxy.
 * Prefer IDX (visitor agreement). Fall back to VOW-only setups.
 */
export function getPropTxConfig(): PropTxConfig | null {
  return getPropTxIdxConfig() ?? getPropTxVowConfig();
}

/**
 * Credentials for MLS sync into Neon.
 * Prefer IDX (visitor agreement). Use optional VOW Token when IDX is missing,
 * or pass VOW config explicitly for sold enrichment.
 */
export function getPropTxSyncConfig(): PropTxConfig | null {
  return getPropTxIdxConfig() ?? getPropTxVowConfig();
}

/** VOW Token when configured — used to keep sold/history fresh for clients. */
export function getPropTxSoldSyncConfig(): PropTxConfig | null {
  return getPropTxVowConfig();
}

export function isPropTxConfigured(): boolean {
  return getPropTxConfig() != null;
}

/** Live PropTx serve mode (DB-backed provider). */
export function isPropTxProvider(): boolean {
  return process.env.LISTING_PROVIDER === "proptx";
}

/**
 * Site access mode from PROPTX_FEED (not which Token ID is used to sync).
 * IDX: visitors browse active listings; sold/history stay client-only (VOW rules).
 * VOW: entire MLS surface requires a registered client (legacy).
 */
export function getSiteFeedMode(): PropTxFeed {
  const feed = process.env.PROPTX_FEED?.trim().toLowerCase();
  return feed === "vow" ? "vow" : "idx";
}

/**
 * When true, MLS browse/search requires a registered Houzzat client.
 */
export function isVowOnlyMlsMode(): boolean {
  if (!isPropTxProvider()) return false;
  return getSiteFeedMode() === "vow";
}
