/**
 * NL property-search parser v2 (deterministic).
 * Default OFF — preserves legacy parseSearchQuery behavior.
 */
export const NL_SEARCH_PARSER_V2_ENV =
  "NEXT_PUBLIC_NL_SEARCH_PARSER_V2" as const;

export function isNlSearchParserV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2 === "1";
}
