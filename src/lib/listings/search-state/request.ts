import { buildListingsQuery } from "@/lib/listings/search-state/query";
import type { CommittedSearch, SearchState } from "@/lib/listings/search-state/types";

/** Stable request identity = full listings query string (includes view limit). */
export function listingsRequestId(committed: CommittedSearch): string {
  return buildListingsQuery(committed);
}

/**
 * After ISSUE_REQUEST, only ACK_RESPONSE with matching seq + requestId applies.
 * Newer ISSUE_REQUEST bumps seq so older responses are rejected.
 */
export function shouldAcceptListingsResponse(
  state: SearchState,
  issuedSeq: number,
  issuedRequestId: string,
): boolean {
  if (issuedSeq !== state.requestSeq) return false;
  if (state.lastIssuedRequestId == null) return false;
  return state.lastIssuedRequestId === issuedRequestId;
}

export function withIssuedRequest(
  state: SearchState,
  requestId: string,
): SearchState {
  return {
    ...state,
    requestSeq: state.requestSeq + 1,
    lastIssuedRequestId: requestId,
  };
}
