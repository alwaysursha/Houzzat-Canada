/**
 * Royal Collection — Signature One.
 * Scoped palette for dev preview only. Not offered in Website Design.
 */
import {
  ROYAL_COLLECTION_ONE_TEMPLATE_ID,
  buildThemeId,
  type TemplateThemeDefinition,
} from "./types";

export const ROYAL_COLLECTION_ONE_THEMES: readonly TemplateThemeDefinition[] = [
  {
    key: "signature",
    id: buildThemeId(ROYAL_COLLECTION_ONE_TEMPLATE_ID, "signature"),
    label: "Signature",
    description:
      "Royal navy, emerald, and champagne gold for a personal luxury brand.",
    palette: {
      primary: "#0B1F3A",
      secondary: "#071629",
      accent: "#C8A66A",
      surfaceTint: "#F6F8F7",
    },
  },
];
