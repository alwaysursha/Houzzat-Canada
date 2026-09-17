import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type HouzzatFcmPlugin = {
  getToken(): Promise<{ token: string }>;
  addListener(
    eventName: "fcmToken",
    listenerFunc: (event: { token: string }) => void,
  ): Promise<PluginListenerHandle>;
};

/** Native Houzzat iOS plugin from ios/App/App/HouzzatFcmPlugin.swift. */
export const HouzzatFcm = registerPlugin<HouzzatFcmPlugin>("HouzzatFcm");
