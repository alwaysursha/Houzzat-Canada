export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  );
}

type ActivityFetch = (leadId: string, signal: AbortSignal) => Promise<void>;

/**
 * At most one Lead Profile /activity fetch at a time.
 * Extra refresh requests coalesce into a single trailing run after the
 * current request finishes. Abort cancels the in-flight request and
 * drops any queued trailing refresh.
 */
export function createLeadProfileActivityGate() {
  let inFlight = false;
  let trailing = false;
  let controller: AbortController | null = null;
  let queuedLeadId = "";
  let queuedFetch: ActivityFetch | null = null;

  function abortActive() {
    trailing = false;
    queuedFetch = null;
    const active = controller;
    controller = null;
    inFlight = false;
    active?.abort();
  }

  async function run(leadId: string, fetchActivity: ActivityFetch) {
    inFlight = true;
    trailing = false;
    const ac = new AbortController();
    controller = ac;
    try {
      await fetchActivity(leadId, ac.signal);
    } catch (error) {
      if (isAbortError(error) || ac.signal.aborted) {
        return;
      }
      throw error;
    } finally {
      const isCurrent = controller === ac;
      if (isCurrent) {
        controller = null;
        inFlight = false;
      }
      if (
        isCurrent &&
        !ac.signal.aborted &&
        trailing &&
        queuedFetch
      ) {
        const nextLeadId = queuedLeadId;
        const nextFetch = queuedFetch;
        trailing = false;
        void run(nextLeadId, nextFetch);
      }
    }
  }

  function request(leadId: string, fetchActivity: ActivityFetch) {
    queuedLeadId = leadId;
    queuedFetch = fetchActivity;
    if (inFlight) {
      trailing = true;
      return;
    }
    void run(leadId, fetchActivity);
  }

  return {
    abortActive,
    request,
    get inFlight() {
      return inFlight;
    },
    get trailing() {
      return trailing;
    },
  };
}
