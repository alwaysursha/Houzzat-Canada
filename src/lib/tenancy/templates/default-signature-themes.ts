/**
 * Stage 6.11A — six Default (default-signature) theme palettes.
 * Same website / components; visual identity via tokens only.
 */
import {
  buildThemeId,
  DEFAULT_TEMPLATE_ID,
  type TemplateThemeDefinition,
} from "./types";

/**
 * Exact palette values for Default template themes.
 * primary / secondary / accent are #RRGGBB (validated brand colors).
 * surfaceTint is a soft page wash for previews.
 */
export const DEFAULT_SIGNATURE_THEMES: readonly TemplateThemeDefinition[] = [
  {
    key: "mint",
    id: buildThemeId(DEFAULT_TEMPLATE_ID, "mint"),
    label: "Mint / Green",
    description: "Fresh, modern, welcoming — the original Houzzat direction.",
    palette: {
      primary: "#0F6B4C",
      secondary: "#0A4D38",
      accent: "#1F7A8C",
      surfaceTint: "#EEF3F0",
    },
  },
  {
    key: "light-blue",
    id: buildThemeId(DEFAULT_TEMPLATE_ID, "light-blue"),
    label: "Light Blue",
    description: "Clean, approachable, professional.",
    palette: {
      primary: "#3B82C4",
      secondary: "#1E5A8A",
      accent: "#5BA3D9",
      surfaceTint: "#F0F5FA",
    },
  },
  {
    key: "dark-blue",
    id: buildThemeId(DEFAULT_TEMPLATE_ID, "dark-blue"),
    label: "Dark Blue",
    description: "Deeper, richer, more professional — not bright royal blue.",
    palette: {
      primary: "#1B3A5C",
      secondary: "#0F2438",
      accent: "#3D6E99",
      surfaceTint: "#EEF2F6",
    },
  },
  {
    key: "purple",
    id: buildThemeId(DEFAULT_TEMPLATE_ID, "purple"),
    label: "Purple",
    description: "Premium, elegant, restrained — not neon.",
    palette: {
      primary: "#5C4A7A",
      secondary: "#3D3154",
      accent: "#8A74A8",
      surfaceTint: "#F3F0F6",
    },
  },
  {
    key: "professional-red",
    id: buildThemeId(DEFAULT_TEMPLATE_ID, "professional-red"),
    label: "Professional Red",
    description: "Deep corporate real-estate red — confident, not fire-engine.",
    palette: {
      primary: "#8B3A3A",
      secondary: "#5C2424",
      accent: "#B07A5C",
      surfaceTint: "#F7F1F0",
    },
  },
  {
    key: "beige",
    id: buildThemeId(DEFAULT_TEMPLATE_ID, "beige"),
    label: "Beige",
    description: "Warm taupe / caramel sophistication with strong contrast.",
    palette: {
      primary: "#8A6F4E",
      secondary: "#5E4A34",
      accent: "#A89070",
      surfaceTint: "#F5F1EA",
    },
  },
] as const;
