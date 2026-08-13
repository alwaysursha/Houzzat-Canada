/**
 * Stack of Admin/Agent drawers/modals/sheets for Capacitor hardware Back.
 * Highest priority closes first; listing sheet stays outside this stack.
 */

export const STAFF_OVERLAY_PRIORITY = {
  shellDrawer: 70,
  sheet: 80,
  activity: 85,
  leadPopup: 90,
  emailPreview: 100,
  siteAlert: 110,
} as const;

export type StaffOverlayEntry = {
  id: string;
  /** Higher closes first when multiple are open. */
  priority: number;
  close: () => void;
};

let stack: StaffOverlayEntry[] = [];

/**
 * Register an open overlay. Returns unregister (call from effect cleanup).
 */
export function pushStaffOverlay(entry: StaffOverlayEntry): () => void {
  stack = [...stack.filter((e) => e.id !== entry.id), entry];
  let released = false;
  return () => {
    if (released) return;
    released = true;
    stack = stack.filter((e) => e.id !== entry.id);
  };
}

export function hasStaffOverlay(): boolean {
  return stack.length > 0;
}

/** Close the highest-priority overlay. Returns true if Back was consumed. */
export function closeTopStaffOverlay(): boolean {
  if (stack.length === 0) return false;
  const top = [...stack].sort((a, b) => b.priority - a.priority)[0];
  if (!top) return false;
  try {
    top.close();
  } catch (error) {
    console.error("[staff-overlay] close failed", error);
  }
  return true;
}

/** Test helper — not used in production paths. */
export function __resetStaffOverlayStackForTests() {
  stack = [];
}
