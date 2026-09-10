/**
 * V2 fetch session: abort, stale-lead protection, one in-flight per resource key,
 * coalesced trailing refresh. No retries.
 */

export function isV2AbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error != null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  );
}

type V2Fetch = (leadId: string, signal: AbortSignal) => Promise<void>;

type GateState = {
  inFlight: boolean;
  trailing: boolean;
  controller: AbortController | null;
  queuedLeadId: string;
  queuedFetch: V2Fetch | null;
};

function emptyGate(): GateState {
  return {
    inFlight: false,
    trailing: false,
    controller: null,
    queuedLeadId: "",
    queuedFetch: null,
  };
}

export function createLeadProfileV2Session() {
  const gates = new Map<string, GateState>();

  function gateFor(resourceKey: string): GateState {
    const existing = gates.get(resourceKey);
    if (existing) return existing;
    const created = emptyGate();
    gates.set(resourceKey, created);
    return created;
  }

  function abortGate(gate: GateState) {
    gate.trailing = false;
    gate.queuedFetch = null;
    const active = gate.controller;
    gate.controller = null;
    gate.inFlight = false;
    active?.abort();
  }

  function abort(resourceKey: string) {
    const gate = gates.get(resourceKey);
    if (gate) abortGate(gate);
  }

  function abortAll() {
    for (const gate of gates.values()) abortGate(gate);
  }

  async function run(resourceKey: string, leadId: string, fetchFn: V2Fetch) {
    const gate = gateFor(resourceKey);
    gate.inFlight = true;
    gate.trailing = false;
    const ac = new AbortController();
    gate.controller = ac;
    try {
      await fetchFn(leadId, ac.signal);
    } catch (error) {
      if (isV2AbortError(error) || ac.signal.aborted) {
        return;
      }
      throw error;
    } finally {
      const isCurrent = gate.controller === ac;
      if (isCurrent) {
        gate.controller = null;
        gate.inFlight = false;
      }
      if (isCurrent && !ac.signal.aborted && gate.trailing && gate.queuedFetch) {
        const nextLeadId = gate.queuedLeadId;
        const nextFetch = gate.queuedFetch;
        gate.trailing = false;
        void run(resourceKey, nextLeadId, nextFetch);
      }
    }
  }

  function request(resourceKey: string, leadId: string, fetchFn: V2Fetch) {
    const gate = gateFor(resourceKey);
    if (gate.inFlight && gate.queuedLeadId !== leadId) {
      abortGate(gate);
    }
    gate.queuedLeadId = leadId;
    gate.queuedFetch = fetchFn;
    if (gate.inFlight) {
      gate.trailing = true;
      return;
    }
    void run(resourceKey, leadId, fetchFn);
  }

  /** Load more: never queue a second in-flight/cursor request. */
  function requestIfIdle(
    resourceKey: string,
    leadId: string,
    fetchFn: V2Fetch,
  ): boolean {
    const gate = gateFor(resourceKey);
    if (gate.inFlight) return false;
    request(resourceKey, leadId, fetchFn);
    return true;
  }

  function inspect(resourceKey: string) {
    const gate = gateFor(resourceKey);
    return {
      inFlight: gate.inFlight,
      trailing: gate.trailing,
    };
  }

  return {
    request,
    requestIfIdle,
    abort,
    abortAll,
    inspect,
  };
}

export type LeadProfileV2Session = ReturnType<typeof createLeadProfileV2Session>;
