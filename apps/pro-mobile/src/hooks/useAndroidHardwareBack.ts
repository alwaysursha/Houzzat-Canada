/**
 * Android hardware back: overlay stack → shell pops → double-press exit.
 */

import { useEffect, useRef } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";
import { runAndroidBackStack } from "../lib/android-back-stack";

export type AndroidBackHandlers = {
  /** Highest priority first. Return true if the back press was handled. */
  onBack: () => boolean;
  /** True when already at the app "home" surface (exit candidate). */
  isAtRoot: () => boolean;
};

const EXIT_WINDOW_MS = 2200;

export function useAndroidHardwareBack(handlers: AndroidBackHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const lastRootBackAt = useRef(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
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
        BackHandler.exitApp();
        return true;
      }

      lastRootBackAt.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      return true;
    });

    return () => sub.remove();
  }, []);
}
