"use client";

import { useEffect, useRef } from "react";
import {
  STAFF_OVERLAY_PRIORITY,
  pushStaffOverlay,
} from "@/lib/mobile/staff-overlay-stack";
import { acquireScrollLock } from "@/lib/scroll-lock";

export { STAFF_OVERLAY_PRIORITY };

/**
 * While `open`, register for Capacitor hardware Back and (by default) lock body scroll
 * via the shared ref-counted helper.
 */
export function useStaffOverlay(options: {
  open: boolean;
  id: string;
  priority: number;
  onClose: () => void;
  lockScroll?: boolean;
}) {
  const { open, id, priority, onClose, lockScroll = true } = options;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const releaseOverlay = pushStaffOverlay({
      id,
      priority,
      close: () => {
        onCloseRef.current();
      },
    });
    const releaseLock = lockScroll ? acquireScrollLock() : () => {};
    return () => {
      releaseOverlay();
      releaseLock();
    };
  }, [open, id, priority, lockScroll]);
}
