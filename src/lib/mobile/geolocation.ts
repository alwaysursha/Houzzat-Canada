import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export type GeoCoords = {
  lat: number;
  lng: number;
};

export type GeoErrorCode =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unknown";

export class AppGeolocationError extends Error {
  readonly code: GeoErrorCode;

  constructor(code: GeoErrorCode, message: string) {
    super(message);
    this.name = "AppGeolocationError";
    this.code = code;
  }
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

function mapBrowserError(error: GeolocationPositionError): AppGeolocationError {
  if (error.code === error.PERMISSION_DENIED) {
    return new AppGeolocationError(
      "denied",
      "Location access is turned off.",
    );
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return new AppGeolocationError(
      "unavailable",
      "Couldn’t determine your location.",
    );
  }
  if (error.code === error.TIMEOUT) {
    return new AppGeolocationError(
      "timeout",
      "Location request timed out.",
    );
  }
  return new AppGeolocationError("unknown", "Couldn’t get your location.");
}

async function ensureNativePermission(): Promise<void> {
  const current = await Geolocation.checkPermissions();
  let status = current.location;
  if (status === "prompt" || status === "prompt-with-rationale") {
    const requested = await Geolocation.requestPermissions();
    status = requested.location;
  }
  if (status !== "granted") {
    throw new AppGeolocationError(
      "denied",
      "Location access is turned off for Houzzat. Enable it in system settings.",
    );
  }
}

async function getNativeCoordinates(options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<GeoCoords> {
  await ensureNativePermission();
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options.enableHighAccuracy,
      timeout: options.timeout,
      maximumAge: options.maximumAge,
    });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error);
    if (message.includes("denied") || message.includes("permission")) {
      throw new AppGeolocationError(
        "denied",
        "Location access is turned off for Houzzat. Enable it in system settings.",
      );
    }
    if (message.includes("timeout")) {
      throw new AppGeolocationError("timeout", "Location request timed out.");
    }
    throw new AppGeolocationError(
      "unavailable",
      "Couldn’t determine your location.",
    );
  }
}

function getBrowserCoordinates(options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(
        new AppGeolocationError(
          "unsupported",
          "Location isn’t available in this browser.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => reject(mapBrowserError(error)),
      {
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: options.timeout,
        maximumAge: options.maximumAge,
      },
    );
  });
}

/** Current coordinates — Capacitor native permissions on app, browser API on web. */
export async function getCurrentCoordinates(options?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}): Promise<GeoCoords> {
  const resolved = {
    enableHighAccuracy: options?.enableHighAccuracy ?? false,
    timeout: options?.timeout ?? 12_000,
    maximumAge: options?.maximumAge ?? 60_000,
  };

  if (isNativeApp()) {
    return getNativeCoordinates(resolved);
  }
  return getBrowserCoordinates(resolved);
}

export async function readLocationPermissionState(): Promise<
  PermissionState | "unknown"
> {
  if (isNativeApp()) {
    try {
      const current = await Geolocation.checkPermissions();
      if (current.location === "granted") return "granted";
      if (current.location === "denied") return "denied";
      return "prompt";
    } catch {
      return "unknown";
    }
  }

  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state;
  } catch {
    return "unknown";
  }
}

export function locationErrorMessage(error: unknown): string {
  if (error instanceof AppGeolocationError) {
    if (error.code === "denied") {
      return isNativeApp()
        ? "Location access is turned off for Houzzat. Enable Location in Android settings → Apps → Houzzat."
        : "Location access is turned off for this site. You can still browse homes on the map.";
    }
    return error.message;
  }
  return isNativeApp()
    ? "Couldn’t get your location. Check that Location is enabled for Houzzat."
    : "Couldn’t get your location. Check browser permissions.";
}
