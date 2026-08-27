/**
 * Stage 3K.5.5.1 — deterministic tenant palette from validated brand colors.
 */
import type { WorkspaceBrandColors } from "@/lib/tenancy/brand-dto";
import { validateBrandColor } from "@/lib/tenancy/brand-colors";

export type TenantThemeTokens = {
  primary: string;
  primaryStrong: string;
  accent: string;
  surface: string;
  ink: string;
  primaryRgb: string;
  accentRgb: string;
  mist: string;
  line: string;
  background: string;
  accentSoft: string;
  border: string;
  ring: string;
  link: string;
  button: string;
  buttonHover: string;
};

function safeHex(raw: string, fallback: string): string {
  const result = validateBrandColor(raw);
  return result.ok ? result.value : fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbString(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

/** Mix brand color toward white (0 = pure color, 1 = white). */
export function mixHexWithWhite(hex: string, whiteWeight: number): string {
  const { r, g, b } = hexToRgb(hex);
  const w = Math.min(1, Math.max(0, whiteWeight));
  const c = 1 - w;
  const mix = (channel: number) => Math.round(channel * c + 255 * w);
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

export function deriveTenantThemeTokens(
  colors: WorkspaceBrandColors,
): TenantThemeTokens {
  const primary = safeHex(colors.primary, "#2563EB");
  const primaryStrong = safeHex(colors.secondary, "#1E40AF");
  const accent = safeHex(colors.accent, "#0EA5E9");
  const surface = safeHex(colors.surface, "#FFFFFF");
  const ink = safeHex(colors.ink, "#111827");

  const mist = mixHexWithWhite(primary, 0.94);
  const line = mixHexWithWhite(primary, 0.82);
  const accentSoft = mixHexWithWhite(accent, 0.9);
  const border = mixHexWithWhite(primary, 0.78);
  const buttonHover = primaryStrong;

  return {
    primary,
    primaryStrong,
    accent,
    surface,
    ink,
    primaryRgb: rgbString(primary),
    accentRgb: rgbString(accent),
    mist,
    line,
    background: mist,
    accentSoft,
    border,
    ring: mixHexWithWhite(primary, 0.55),
    link: primary,
    button: primary,
    buttonHover,
  };
}
