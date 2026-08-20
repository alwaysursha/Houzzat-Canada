/**
 * In-memory biometric gate lock flag for push / navigation sequencing.
 * When locked, pending push destinations stay stashed until unlock.
 */

let gateLocked = false;
const unlockListeners = new Set<() => void>();

export function isBiometricGateLocked(): boolean {
  return gateLocked;
}

export function setBiometricGateLocked(locked: boolean): void {
  const wasLocked = gateLocked;
  gateLocked = locked;
  if (wasLocked && !locked) {
    for (const listener of unlockListeners) {
      try {
        listener();
      } catch {
        // ignore listener errors
      }
    }
  }
}

/** Subscribe once — fires when the gate transitions locked → unlocked. */
export function onBiometricGateUnlocked(listener: () => void): () => void {
  unlockListeners.add(listener);
  return () => {
    unlockListeners.delete(listener);
  };
}

/** Test helper */
export function __resetBiometricGateStateForTests(): void {
  gateLocked = false;
  unlockListeners.clear();
}
