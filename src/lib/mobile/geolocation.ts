import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import {
  NORMAL_LOCATION_TIMEOUT_MS,
} from "@/lib/mobile/location-policy";

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
      "Couldn’t determine your location. Check that Location is turned on.",
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

/**
 * Native permission gate.
 * When `requestPermission` is false, never calls requestPermissions() —
 * Home/background code cannot accidentally open the OS dialog.
 */
async function ensureNativePermission(requestPermission: boolean): Promise<void> {
  const current = await Geolocation.checkPermissions();
  let status = current.location;

  if (status === "granted") return;

  if (
    requestPermission &&
    (status === "prompt" || status === "prompt-with-rationale")
  ) {
    const requested = await Geolocation.requestPermissions();
    status = requested.location;
  }

  if (status === "granted") return;

  if (status === "denied") {
    throw new AppGeolocationError(
      "denied",
      "Location access is turned off for Houzzat. Enable it in system settings.",
    );
  }

  // Still prompt/unknown and we were not allowed to ask.
  throw new AppGeolocationError(
    "denied",
    "Location permission is required to use Near me.",
  );
}

async function getNativeCoordinates(options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  requestPermission: boolean;
}): Promise<GeoCoords> {
  await ensureNativePermission(options.requestPermission);
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
    if (error instanceof AppGeolocationError) throw error;
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
      "Couldn’t determine your location. Check that Location is turned on.",
    );
  }
}

async function getBrowserCoordinates(options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  requestPermission: boolean;
}): Promise<GeoCoords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new AppGeolocationError(
      "unsupported",
      "Location isn’t available in this browser.",
    );
  }

  if (!options.requestPermission) {
    // Avoid implicit browser prompt from passive callers.
    const state = await readLocationPermissionState();
    if (state !== "granted") {
      throw new AppGeolocationError(
        "denied",
        "Location permission is required to use Near me.",
      );
    }
  }

  return new Promise((resolve, reject) => {
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

/**
 * Current coordinates — Capacitor native permissions on app, browser API on web.
 * Default: do NOT request permission (safe for Home effects).
 * Pass `requestPermission: true` only from explicit user actions (Near Me CTA).
 */
export async function getCurrentCoordinates(options?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  /** When true, may show the OS/browser permission dialog. Default false. */
  requestPermission?: boolean;
}): Promise<GeoCoords> {
  const resolved = {
    enableHighAccuracy: options?.enableHighAccuracy ?? false,
    timeout: options?.timeout ?? NORMAL_LOCATION_TIMEOUT_MS,
    maximumAge: options?.maximumAge ?? 60_000,
    requestPermission: options?.requestPermission === true,
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
    if (error.code === "unavailable") {
      return isNativeApp()
        ? "Location services look turned off. Turn on Location in Android settings, then try again."
        : "Couldn’t determine your location. Check that location services are on.";
    }
    return error.message;
  }
  return isNativeApp()
    ? "Couldn’t get your location. Check that Location is enabled for Houzzat."
    : "Couldn’t get your location. Check browser permissions.";
}
