/**
 * Pure Buyer/Seller desk picker.
 * Does not mutate weights or tenancy config.
 *
 * Seller LISTING_AGENT uses the configured listing agent when eligible.
 * Seller PERCENTAGE uses the seller lane weights (Houzzat production).
 * Multi-agent workspaces with no eligible listing agent and no positive
 * lane weights fail closed (pond) — never an arbitrary agents[0].
 */
import type { LeadIntent, SellerLeadAssignMode } from "@prisma/client";

export type RoutedAssigneeWeight = {
  id: string;
  agentId: string;
  lane: "BUYER" | "SELLER";
  percent: number;
  assignedCount: number;
};

export type RoutedAssigneePick = {
  agentId: string | null;
  weightId: string | null;
  reason:
    | "no_agents"
    | "sole_agent"
    | "listing_agent"
    | "percentage"
    | "unconfigured_multi_agent";
};

export function pickRoutedAssignee(input: {
  intent: LeadIntent;
  agentIds: string[];
  sellerAssignMode?: SellerLeadAssignMode | null;
  listingAgentId?: string | null;
  weights: RoutedAssigneeWeight[];
}): RoutedAssigneePick {
  const agentIds = input.agentIds.filter(Boolean);
  if (agentIds.length === 0) {
    return { agentId: null, weightId: null, reason: "no_agents" };
  }
  if (agentIds.length === 1) {
    return { agentId: agentIds[0]!, weightId: null, reason: "sole_agent" };
  }

  const pool = new Set(agentIds);

  if (input.intent === "SELLER" && input.sellerAssignMode === "LISTING_AGENT") {
    const listingAgentId = input.listingAgentId?.trim() || null;
    if (listingAgentId && pool.has(listingAgentId)) {
      return {
        agentId: listingAgentId,
        weightId: null,
        reason: "listing_agent",
      };
    }
  }

  const lane: "BUYER" | "SELLER" =
    input.intent === "SELLER" ? "SELLER" : "BUYER";
  const weights = input.weights.filter(
    (w) => w.lane === lane && w.percent > 0 && pool.has(w.agentId),
  );
  if (weights.length === 0) {
    return {
      agentId: null,
      weightId: null,
      reason: "unconfigured_multi_agent",
    };
  }

  let best = weights[0]!;
  let bestScore =
    best.percent > 0
      ? best.assignedCount / best.percent
      : Number.POSITIVE_INFINITY;
  for (const weight of weights.slice(1)) {
    const score =
      weight.percent > 0
        ? weight.assignedCount / weight.percent
        : Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      best = weight;
      bestScore = score;
    }
  }

  return { agentId: best.agentId, weightId: best.id, reason: "percentage" };
}
