/**
 * Stage 3K.5.32 — Pure gesture classifier for HouzzatPRO StaffPullToRefresh.
 * Deterministic and testable without DOM / React dependencies.
 */

export const STAFF_PULL_THRESHOLD_PX = 96;
export const STAFF_PULL_MAX_PX = 120;
export const STAFF_PULL_DIRECTION_LOCK_PX = 10;
export const STAFF_PULL_VERTICAL_DOMINANCE = 1.5;
export const STAFF_PULL_COOLDOWN_MS = 1500;

export type GestureDirection = "undetermined" | "vertical" | "horizontal" | "upward";

export type StaffPullGestureState = {
  startX: number;
  startY: number;
  direction: GestureDirection;
  pullPx: number;
  armed: boolean;
  cancelled: boolean;
};

export function createInitialGestureState(startX: number, startY: number): StaffPullGestureState {
  return {
    startX,
    startY,
    direction: "undetermined",
    pullPx: 0,
    armed: false,
    cancelled: false,
  };
}

export function evaluatePullMove(
  current: StaffPullGestureState,
  currentX: number,
  currentY: number,
  options?: {
    thresholdPx?: number;
    maxPx?: number;
    scrollTop?: number;
  },
): StaffPullGestureState {
  if (current.cancelled) {
    return current;
  }

  const scrollTop = options?.scrollTop ?? 0;
  if (scrollTop > 0) {
    return { ...current, cancelled: true, pullPx: 0, armed: false };
  }

  const threshold = options?.thresholdPx ?? STAFF_PULL_THRESHOLD_PX;
  const maxPx = options?.maxPx ?? STAFF_PULL_MAX_PX;

  const deltaX = currentX - current.startX;
  const deltaY = currentY - current.startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  let direction = current.direction;

  if (direction === "undetermined") {
    // If movement is still tiny, do not classify or arm yet
    if (absX < STAFF_PULL_DIRECTION_LOCK_PX && absY < STAFF_PULL_DIRECTION_LOCK_PX) {
      return current;
    }

    if (deltaY < 0) {
      // Upward scroll
      return {
        ...current,
        direction: "upward",
        cancelled: true,
        pullPx: 0,
        armed: false,
      };
    }

    // Horizontal dominates or equal
    if (absX >= deltaY || deltaY < absX * STAFF_PULL_VERTICAL_DOMINANCE) {
      return {
        ...current,
        direction: "horizontal",
        cancelled: true,
        pullPx: 0,
        armed: false,
      };
    }

    // Clear downward vertical movement dominates
    direction = "vertical";
  }

  if (direction !== "vertical") {
    return { ...current, cancelled: true, pullPx: 0, armed: false };
  }

  if (deltaY <= 0) {
    return { ...current, pullPx: 0, armed: false };
  }

  const damped = Math.min(maxPx, deltaY * 0.5);
  const armed = damped >= threshold;

  return {
    ...current,
    direction: "vertical",
    pullPx: damped,
    armed,
  };
}

export function shouldCommitRefresh(
  state: StaffPullGestureState,
  isRefreshing: boolean,
  lastRefreshedAt: number,
  now: number = Date.now(),
): boolean {
  if (isRefreshing) return false;
  if (state.cancelled) return false;
  if (state.direction !== "vertical") return false;
  if (!state.armed) return false;
  if (now - lastRefreshedAt < STAFF_PULL_COOLDOWN_MS) return false;
  return true;
}
