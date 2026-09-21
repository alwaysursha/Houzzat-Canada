/**
 * Debounced onboarding draft persistence (no COMPLETE status).
 * Latest scheduled value wins; flush() drains pending work before uploads.
 */

export const ONBOARDING_DRAFT_DEBOUNCE_MS = 700;

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

export type DebouncedDraftScheduleHandle = {
  cancel: () => void;
};

export type DebouncedDraftSaverOptions<T> = {
  debounceMs?: number;
  save: (value: T) => Promise<void>;
  onStatus?: (status: DraftSaveStatus) => void;
  scheduleTimer?: (
    callback: () => void,
    ms: number,
  ) => DebouncedDraftScheduleHandle;
};

const UNSET = Symbol("unset");

export class DebouncedDraftSaver<T> {
  private readonly debounceMs: number;
  private readonly saveFn: (value: T) => Promise<void>;
  private readonly onStatus?: (status: DraftSaveStatus) => void;
  private readonly scheduleTimer: (
    callback: () => void,
    ms: number,
  ) => DebouncedDraftScheduleHandle;

  private timer: DebouncedDraftScheduleHandle | null = null;
  private pending: T | typeof UNSET = UNSET;
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  private disposed = false;
  private inFlight = false;

  status: DraftSaveStatus = "idle";

  constructor(options: DebouncedDraftSaverOptions<T>) {
    this.debounceMs = options.debounceMs ?? ONBOARDING_DRAFT_DEBOUNCE_MS;
    this.saveFn = options.save;
    this.onStatus = options.onStatus;
    this.scheduleTimer =
      options.scheduleTimer ??
      ((callback, ms) => {
        const id = setTimeout(callback, ms);
        return { cancel: () => clearTimeout(id) };
      });
  }

  hasUnsavedWork(): boolean {
    return this.pending !== UNSET || this.inFlight || this.timer !== null;
  }

  schedule(value: T): void {
    if (this.disposed) return;
    this.pending = value;
    this.timer?.cancel();
    this.timer = this.scheduleTimer(() => {
      this.timer = null;
      void this.enqueue();
    }, this.debounceMs);
  }

  flush(): Promise<void> {
    this.timer?.cancel();
    this.timer = null;
    return this.enqueue();
  }

  whenIdle(): Promise<void> {
    return this.chain;
  }

  dispose(): void {
    this.disposed = true;
    this.timer?.cancel();
    this.timer = null;
    this.pending = UNSET;
  }

  private setStatus(next: DraftSaveStatus): void {
    this.status = next;
    this.onStatus?.(next);
  }

  private enqueue(): Promise<void> {
    this.chain = this.chain.then(
      () => this.drain(),
      () => this.drain(),
    );
    return this.chain;
  }

  private async drain(): Promise<void> {
    while (this.pending !== UNSET && !this.disposed) {
      const value = this.pending;
      this.pending = UNSET;
      const gen = ++this.generation;
      this.inFlight = true;
      this.setStatus("saving");
      try {
        await this.saveFn(value);
        if (
          !this.disposed &&
          gen === this.generation &&
          this.pending === UNSET
        ) {
          this.setStatus("saved");
        }
      } catch {
        if (
          !this.disposed &&
          gen === this.generation &&
          this.pending === UNSET
        ) {
          this.setStatus("error");
        }
      } finally {
        this.inFlight = false;
      }
    }
  }
}

export type FakeDraftClock = {
  now: () => number;
  scheduleTimer: (
    callback: () => void,
    ms: number,
  ) => DebouncedDraftScheduleHandle;
  advance: (ms: number) => Promise<void>;
};

/** Deterministic timer for draft autosave selftests. */
export function createFakeDraftClock(): FakeDraftClock {
  let now = 0;
  const timers: Array<{
    at: number;
    callback: () => void;
    cancelled: boolean;
  }> = [];

  return {
    now: () => now,
    scheduleTimer(callback, ms) {
      const timer = {
        at: now + ms,
        callback,
        cancelled: false,
      };
      timers.push(timer);
      return {
        cancel: () => {
          timer.cancelled = true;
        },
      };
    },
    async advance(ms: number) {
      now += ms;
      const due = timers
        .filter((timer) => !timer.cancelled && timer.at <= now)
        .sort((a, b) => a.at - b.at);
      for (const timer of due) {
        timer.cancelled = true;
        timer.callback();
      }
      await Promise.resolve();
    },
  };
}
