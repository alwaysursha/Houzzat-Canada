/**
 * Stage 5.12B — native CMA PDF save/share bridge.
 */

import { NativeModules } from "react-native";

type HouzzatProPdfModule = {
  savePdf(filename: string, base64: string): Promise<string>;
  sharePdf(filename: string, base64: string): Promise<string>;
};

function getModule(): HouzzatProPdfModule | null {
  const mod = NativeModules.HouzzatProPdf as HouzzatProPdfModule | undefined;
  if (!mod || typeof mod.savePdf !== "function") return null;
  return mod;
}

export async function saveCmaPdfToDevice(
  filename: string,
  base64: string,
): Promise<{ ok: true; uri: string } | { ok: false; message: string }> {
  const mod = getModule();
  if (!mod) {
    return { ok: false, message: "PDF save is not available on this build" };
  }
  try {
    const uri = await mod.savePdf(filename, base64);
    return { ok: true, uri };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Couldn't save PDF",
    };
  }
}

export async function shareCmaPdf(
  filename: string,
  base64: string,
): Promise<{ ok: true; uri: string } | { ok: false; message: string }> {
  const mod = getModule();
  if (!mod) {
    return { ok: false, message: "PDF share is not available on this build" };
  }
  try {
    const uri = await mod.sharePdf(filename, base64);
    return { ok: true, uri };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Couldn't share PDF",
    };
  }
}

/** Convert ArrayBuffer → base64 without Node Buffer (Hermes-safe). */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(binary);
  }
  // Fallback alphabet encode
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = binary.charCodeAt(i + 1);
    const c = binary.charCodeAt(i + 2);
    const bitmap = (a << 16) | ((b || 0) << 8) | (c || 0);
    out +=
      chars.charAt((bitmap >> 18) & 63) +
      chars.charAt((bitmap >> 12) & 63) +
      (Number.isNaN(b) ? "=" : chars.charAt((bitmap >> 6) & 63)) +
      (Number.isNaN(c) ? "=" : chars.charAt(bitmap & 63));
  }
  return out;
}
