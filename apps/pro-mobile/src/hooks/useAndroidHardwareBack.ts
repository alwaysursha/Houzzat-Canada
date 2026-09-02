/**
 * Android hardware back: pop overlays → home tab → double-press exit with alert.
 */

import { useCallback, useEffect, useRef } from "react";
import { Alert, BackHandler, Platform, ToastAndroid } from "react-native";

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

  const requestExit = useCallback(() => {
    Alert.alert("Exit HouzzatPRO?", "Close the app and return to your home screen.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Exit",
        style: "destructive",
        onPress: () => {
          BackHandler.exitApp();
        },
      },
    ]);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
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
        requestExit();
        return true;
      }

      lastRootBackAt.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      return true;
    });

    return () => sub.remove();
  }, [requestExit]);
}
