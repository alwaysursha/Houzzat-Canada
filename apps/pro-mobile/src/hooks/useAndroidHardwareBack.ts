/**
 * Android hardware back: overlay stack → shell pops → double-press exit.
 */

import { useEffect, useRef } from "react";
import { Platform, ToastAndroid } from "react-native";
import { runAndroidBackStack } from "../lib/android-back-stack";
import {
  addAndroidHardwareBackListener,
  androidHardwareBackExitApp,
  promoteAndroidHardwareBackSubscription,
} from "../lib/android-hardware-back";
import { traceAndroidBack } from "../lib/android-back-trace";

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
      traceAndroidBack("js agent-shell listener enter");
      if (runAndroidBackStack()) {
        lastRootBackAt.current = 0;
        traceAndroidBack("js agent-shell consumed android-back-stack");
        return true;
      }

      const { onBack, isAtRoot } = handlersRef.current;
      const handled = onBack();
      traceAndroidBack("js agent-shell onBack result", { handled });
      if (handled) {
        lastRootBackAt.current = 0;
        return true;
      }

      const atRoot = isAtRoot();
      traceAndroidBack("js agent-shell isAtRoot", { atRoot });
      if (!atRoot) {
        lastRootBackAt.current = 0;
        traceAndroidBack("js agent-shell consumed non-root");
        return true;
      }

      const now = Date.now();
      if (now - lastRootBackAt.current < EXIT_WINDOW_MS) {
        lastRootBackAt.current = 0;
        traceAndroidBack("js agent-shell exitApp");
        androidHardwareBackExitApp();
        return true;
      }

      lastRootBackAt.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      traceAndroidBack("js agent-shell consumed double-back-toast");
      return true;
    }, "agent-shell");

    // Parent NavigationContainer effect registers useBackButton after this
    // effect. Promote once that commit has finished.
    const promoteTimer = setTimeout(promoteAndroidHardwareBackSubscription, 0);

    return () => {
      clearTimeout(promoteTimer);
      sub.remove();
    };
  }, [enabled]);
}
