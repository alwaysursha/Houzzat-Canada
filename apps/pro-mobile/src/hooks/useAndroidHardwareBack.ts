/**
 * Android hardware back: overlay stack → shell pops → double-press exit.
 */

import { useEffect, useRef } from "react";
import { Platform, ToastAndroid } from "react-native";
import { runAndroidBackStack } from "../lib/android-back-stack";
import {
  addAndroidHardwareBackListener,
  androidHardwareBackExitApp,
} from "../lib/android-hardware-back";

export type AndroidBackHandlers = {
  /** Highest priority first. Return true if the back press was handled. */
  onBack: () => boolean;
  /** True when already at the app "home" surface (exit candidate). */
  isAtRoot: () => boolean;
  /**
   * When false, this shell does not subscribe (e.g. CommandCentre while
   * AgentShell is mounted in Agent Mode — avoid competing handlers).
   */
  enabled?: boolean;
};

const EXIT_WINDOW_MS = 2200;

export function useAndroidHardwareBack(handlers: AndroidBackHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const lastRootBackAt = useRef(0);
  const enabled = handlers.enabled !== false;

  useEffect(() => {
    if (Platform.OS !== "android" || !enabled) return;

    const sub = addAndroidHardwareBackListener(() => {
      if (runAndroidBackStack()) {
        lastRootBackAt.current = 0;
        return true;
      }

      const { onBack, isAtRoot } = handlersRef.current;
      if (onBack()) {
        lastRootBackAt.current = 0;
        return true;
      }

      if (!isAtRoot()) {
        lastRootBackAt.current = 0;
        return true;
      }

      const now = Date.now();
      if (now - lastRootBackAt.current < EXIT_WINDOW_MS) {
        lastRootBackAt.current = 0;
        androidHardwareBackExitApp();
        return true;
      }

      lastRootBackAt.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      return true;
    }, "agent-shell");

    return () => sub.remove();
  }, [enabled]);
}
