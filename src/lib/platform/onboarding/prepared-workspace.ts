/**
 * Decisions for attaching a paid subscription to a workspace that was
 * prepared before checkout. Automated signup (no prepared workspace) is unchanged.
 */

export const PREPARED_WORKSPACE_SNAPSHOT_KEY = "preparedWorkspaceId" as const;

export type ProvisionWorkspaceTarget =
  | { kind: "existing"; workspaceId: string }
  | { kind: "create" }
  | { kind: "conflict" };

export function selectProvisionWorkspaceTarget(input: {
  runWorkspaceId: string | null;
  subscriptionWorkspaceId: string | null;
  offerWorkspaceId: string | null;
}): ProvisionWorkspaceTarget {
  const offerWorkspaceId = input.offerWorkspaceId?.trim() || null;
  const subscriptionWorkspaceId = input.subscriptionWorkspaceId?.trim() || null;
  const runWorkspaceId = input.runWorkspaceId?.trim() || null;

  if (
    offerWorkspaceId &&
    subscriptionWorkspaceId &&
    offerWorkspaceId !== subscriptionWorkspaceId
  ) {
    return { kind: "conflict" };
  }
  if (
    offerWorkspaceId &&
    runWorkspaceId &&
    offerWorkspaceId !== runWorkspaceId
  ) {
    return { kind: "conflict" };
  }

  const workspaceId = runWorkspaceId ?? offerWorkspaceId ?? subscriptionWorkspaceId;
  if (workspaceId) return { kind: "existing", workspaceId };
  return { kind: "create" };
}

export function placeholderSubscriptionCanBeSuperseded(input: {
  source: string;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
}): boolean {
  return (
    input.source === "INTERNAL" &&
    input.stripeSubscriptionId == null &&
    input.stripeCheckoutSessionId == null
  );
}

/**
 * A live site must stay ACTIVE when a later trial payment attaches.
 * New unpaid signups still follow the subscription status.
 */
export function workspaceStatusAfterPaidProvision(input: {
  currentStatus: "ACTIVE" | "TRIAL" | "SUSPENDED" | "CANCELLED";
  subscriptionStatus: string;
}): "ACTIVE" | "TRIAL" {
  if (input.currentStatus === "ACTIVE") return "ACTIVE";
  return input.subscriptionStatus === "TRIALING" ? "TRIAL" : "ACTIVE";
}

export function preparedWorkspaceIdFromSnapshot(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = (snapshot as Record<string, unknown>)[PREPARED_WORKSPACE_SNAPSHOT_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function ownerActivationSuppressedForPreparedPayment(snapshot: unknown): boolean {
  return preparedWorkspaceIdFromSnapshot(snapshot) != null;
}

export function checkoutCompletionIsDuplicate(input: {
  status: string;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  incomingSubscriptionId: string | null;
  incomingSessionId: string;
}): boolean {
  const paid = input.status === "ACTIVE" || input.status === "TRIALING";
  return (
    paid &&
    input.stripeSubscriptionId === input.incomingSubscriptionId &&
    input.stripeCheckoutSessionId === input.incomingSessionId
  );
}
