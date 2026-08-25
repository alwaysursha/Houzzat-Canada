/**
 * Stage 3I.1 — open-lead switch decision (pure, testable).
 *
 * Confirm only for a *true* cross-workspace switch: valid cookie (or sole
 * implied membership) names workspace A while the lead belongs to B.
 * Missing/stale cookie for a single-membership user is NOT a switch.
 */
export function shouldConfirmWorkspaceSwitch(input: {
  leadWorkspaceId: string;
  /** Cookie value after signature verify (may be null). */
  cookieWorkspaceId: string | null;
  /** ACTIVE memberships on ACTIVE workspaces. */
  activeMemberWorkspaceIds: string[];
}): boolean {
  const memberIds = new Set(input.activeMemberWorkspaceIds);
  if (!memberIds.has(input.leadWorkspaceId)) {
    // Caller should 404; not a confirm case.
    return false;
  }

  const validCookieWorkspaceId =
    input.cookieWorkspaceId && memberIds.has(input.cookieWorkspaceId)
      ? input.cookieWorkspaceId
      : null;

  const soleWorkspaceId =
    input.activeMemberWorkspaceIds.length === 1
      ? input.activeMemberWorkspaceIds[0]!
      : null;

  const effectiveCurrent = validCookieWorkspaceId ?? soleWorkspaceId;
  return (
    effectiveCurrent != null && effectiveCurrent !== input.leadWorkspaceId
  );
}
