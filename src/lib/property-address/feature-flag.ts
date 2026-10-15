/**
 * Central, default-OFF flag for off-market address search navigation.
 * Not tenant-scoped. Enable only with NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED=1.
 */
export const OFF_MARKET_PROPERTY_SEARCH_ENV =
  "NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED" as const;

export function isOffMarketPropertySearchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED === "1";
}
