/**
 * Stage 6.11B.2+ — Agent Signature theme tokens (professional agent palettes).
 */
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  buildThemeId,
  type TemplateThemeDefinition,
} from "./types";

/**
 * Six curated Agent Branded combinations.
 * primary → ink / strong UI · secondary → deep hero · accent → highlight · surfaceTint → page wash
 */
export const AGENT_SIGNATURE_THEMES: readonly TemplateThemeDefinition[] = [
  {
    key: "editorial",
    id: buildThemeId(AGENT_SIGNATURE_TEMPLATE_ID, "editorial"),
    label: "Editorial",
    description: "Warm ivory, charcoal typography, deep professional accent.",
    palette: {
      primary: "#1C1917",
      secondary: "#0C0A09",
      accent: "#8B6914",
      surfaceTint: "#F7F3EC",
    },
  },
  {
    key: "navy",
    id: buildThemeId(AGENT_SIGNATURE_TEMPLATE_ID, "navy"),
    label: "Navy",
    description: "Deep navy authority with cool ivory surfaces.",
    palette: {
      primary: "#1B3A5C",
      secondary: "#0F2438",
      accent: "#A68B5B",
      surfaceTint: "#F3F5F8",
    },
  },
  {
    key: "forest",
    id: buildThemeId(AGENT_SIGNATURE_TEMPLATE_ID, "forest"),
    label: "Forest",
    description: "Established green with warm copper highlights.",
    palette: {
      primary: "#1F3D32",
      secondary: "#102820",
      accent: "#9A6B4F",
      surfaceTint: "#F2F5F3",
    },
  },
  {
    key: "slate",
    id: buildThemeId(AGENT_SIGNATURE_TEMPLATE_ID, "slate"),
    label: "Slate",
    description: "Modern charcoal-slate with cool steel accent.",
    palette: {
      primary: "#2C333A",
      secondary: "#15191D",
      accent: "#6B7C8C",
      surfaceTint: "#F5F6F7",
    },
  },
  {
    key: "burgundy",
    id: buildThemeId(AGENT_SIGNATURE_TEMPLATE_ID, "burgundy"),
    label: "Burgundy",
    description: "Deep wine confidence with warm cream surfaces.",
    palette: {
      primary: "#5C2430",
      secondary: "#2F1218",
      accent: "#A89078",
      surfaceTint: "#F7F2EE",
    },
  },
  {
    key: "bronze",
    id: buildThemeId(AGENT_SIGNATURE_TEMPLATE_ID, "bronze"),
    label: "Bronze",
    description: "Espresso neutrals with refined bronze highlights.",
    palette: {
      primary: "#2A211C",
      secondary: "#14100E",
      accent: "#8C6A3D",
      surfaceTint: "#F6F1EA",
    },
  },
] as const;
