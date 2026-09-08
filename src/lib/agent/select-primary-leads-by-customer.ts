/**
 * One visible CRM row per person.
 *
 * Intake can create multiple Lead records for the same customer (valuation,
 * inquiry, signup). The desk should show a single pipeline card — the most
 * recently updated lead — so web and native stay in sync.
 */

function updatedAtMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function selectPrimaryLeadsByCustomer<
  T extends {
    id: string;
    customerId?: string | null;
    updatedAt: Date | string;
    score: number;
  },
>(leads: T[]): T[] {
  const primary = new Map<string, T>();
  const order: string[] = [];

  for (const lead of leads) {
    const key = lead.customerId ? `c:${lead.customerId}` : `l:${lead.id}`;
    const prev = primary.get(key);
    if (!prev) {
      primary.set(key, lead);
      order.push(key);
      continue;
    }
    if (isPreferredPrimary(lead, prev)) {
      primary.set(key, lead);
    }
  }

  return order.map((key) => primary.get(key)!);
}

function isPreferredPrimary<
  T extends { id: string; updatedAt: Date | string; score: number },
>(candidate: T, current: T): boolean {
  const candidateUpdated = updatedAtMs(candidate.updatedAt);
  const currentUpdated = updatedAtMs(current.updatedAt);
  if (candidateUpdated !== currentUpdated) {
    return candidateUpdated > currentUpdated;
  }
  if (candidate.score !== current.score) {
    return candidate.score > current.score;
  }
  return candidate.id < current.id;
}
