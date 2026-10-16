import type { WorkspaceEmailTemplateType } from "@prisma/client";
import { validateOptionalBrandColor } from "@/lib/tenancy/brand-colors";
import { getMasterEmailTemplate } from "@/lib/email/workspace-templates/registry";
import type {
  EmailTemplateBodySections,
  EmailTemplateContentFields,
  EmailTemplateStyleOverride,
  WorkspaceEmailTemplateDraftInput,
} from "@/lib/email/workspace-templates/types";

const MAX_SUBJECT = 200;
const MAX_INTRO = 2_000;
const MAX_CTA = 80;
const MAX_PARAGRAPHS = 8;
const MAX_PARAGRAPH_LEN = 2_000;

const VAR_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
/**
 * Override fields are plain text only. Reject HTML / event handlers / script
 * vectors so later rendering cannot inject markup even if escape is missed.
 */
const FORBIDDEN_CONTENT_RE =
  /[<>]|<\s*script|javascript:|on\w+\s*=|data:text\/html|vbscript:|&#/i;

export type TemplateValidationResult =
  | { ok: true; value: EmailTemplateContentFields }
  | { ok: false; error: string; code: string };

function emptyContent(): EmailTemplateContentFields {
  return {
    subject: null,
    introText: null,
    bodySections: {},
    ctaText: null,
    style: {},
  };
}

export function extractTemplateVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VAR_RE)) {
    const name = match[1];
    if (name) found.add(name);
  }
  return [...found];
}

function assertSafeText(
  label: string,
  value: string | null | undefined,
  max: number,
  allowedVariables: readonly string[],
): { ok: true; value: string | null } | { ok: false; error: string; code: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be a string`, code: "INVALID_TYPE" };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) {
    return {
      ok: false,
      error: `${label} exceeds ${max} characters`,
      code: "TOO_LONG",
    };
  }
  if (FORBIDDEN_CONTENT_RE.test(trimmed)) {
    return {
      ok: false,
      error: `${label} contains forbidden markup`,
      code: "FORBIDDEN_CONTENT",
    };
  }
  const vars = extractTemplateVariables(trimmed);
  for (const name of vars) {
    if (!allowedVariables.includes(name)) {
      return {
        ok: false,
        error: `Unknown template variable {{${name}}} in ${label}`,
        code: "UNKNOWN_VARIABLE",
      };
    }
  }
  return { ok: true, value: trimmed };
}

type BodySectionsValidation =
  | { ok: true; value: EmailTemplateBodySections }
  | { ok: false; error: string; code: string };

type StyleValidation =
  | { ok: true; value: EmailTemplateStyleOverride }
  | { ok: false; error: string; code: string };

function validateBodySections(
  raw: EmailTemplateBodySections | null | undefined,
  allowedVariables: readonly string[],
): BodySectionsValidation {
  if (raw == null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: "bodySections must be an object",
      code: "INVALID_BODY",
    };
  }
  const keys = Object.keys(raw);
  for (const key of keys) {
    if (key !== "paragraphs") {
      return {
        ok: false,
        error: `Unsupported body section "${key}"`,
        code: "INVALID_BODY",
      };
    }
  }
  if (raw.paragraphs == null) return { ok: true, value: {} };
  if (!Array.isArray(raw.paragraphs)) {
    return {
      ok: false,
      error: "bodySections.paragraphs must be an array",
      code: "INVALID_BODY",
    };
  }
  if (raw.paragraphs.length > MAX_PARAGRAPHS) {
    return {
      ok: false,
      error: `At most ${MAX_PARAGRAPHS} paragraphs allowed`,
      code: "TOO_LONG",
    };
  }
  const paragraphs: string[] = [];
  for (const [i, p] of raw.paragraphs.entries()) {
    const checked = assertSafeText(
      `bodySections.paragraphs[${i}]`,
      p,
      MAX_PARAGRAPH_LEN,
      allowedVariables,
    );
    if (!checked.ok) return checked;
    if (checked.value) paragraphs.push(checked.value);
  }
  return { ok: true, value: paragraphs.length ? { paragraphs } : {} };
}

function validateStyle(
  raw: EmailTemplateStyleOverride | null | undefined,
): StyleValidation {
  if (raw == null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "style must be an object", code: "INVALID_STYLE" };
  }
  for (const key of Object.keys(raw)) {
    if (key !== "primaryColor") {
      return {
        ok: false,
        error: `Unsupported style field "${key}"`,
        code: "INVALID_STYLE",
      };
    }
  }
  const color = validateOptionalBrandColor(raw.primaryColor);
  if (!color.ok) {
    return { ok: false, error: color.error, code: "INVALID_STYLE" };
  }
  return {
    ok: true,
    value: color.value ? { primaryColor: color.value } : {},
  };
}

/**
 * Validate + normalize a tenant draft/publish payload.
 * Unknown variables and unprotected style/body keys are rejected.
 */
export function validateWorkspaceEmailTemplateDraft(
  type: WorkspaceEmailTemplateType,
  input: WorkspaceEmailTemplateDraftInput,
): TemplateValidationResult {
  const master = getMasterEmailTemplate(type);
  if (!master) {
    return { ok: false, error: "Unknown template type", code: "UNKNOWN_TYPE" };
  }

  const allowed = master.allowedVariables;
  const subject = assertSafeText(
    "subject",
    input.subject,
    MAX_SUBJECT,
    allowed,
  );
  if (!subject.ok) return subject;

  const intro = assertSafeText(
    "introText",
    input.introText,
    MAX_INTRO,
    allowed,
  );
  if (!intro.ok) return intro;

  const cta = assertSafeText("ctaText", input.ctaText, MAX_CTA, allowed);
  if (!cta.ok) return cta;

  const body = validateBodySections(input.bodySections, allowed);
  if (!body.ok) return body;

  const style = validateStyle(input.style);
  if (!style.ok) return style;

  return {
    ok: true,
    value: {
      subject: subject.value,
      introText: intro.value,
      bodySections: body.value,
      ctaText: cta.value,
      style: style.value,
    },
  };
}

export function parseStoredContentFields(input: {
  subject?: string | null;
  introText?: string | null;
  bodySectionsJson?: unknown;
  ctaText?: string | null;
  styleJson?: unknown;
}): EmailTemplateContentFields {
  const body =
    input.bodySectionsJson &&
    typeof input.bodySectionsJson === "object" &&
    !Array.isArray(input.bodySectionsJson)
      ? (input.bodySectionsJson as EmailTemplateBodySections)
      : {};
  const style =
    input.styleJson &&
    typeof input.styleJson === "object" &&
    !Array.isArray(input.styleJson)
      ? (input.styleJson as EmailTemplateStyleOverride)
      : {};
  return {
    subject: input.subject ?? null,
    introText: input.introText ?? null,
    bodySections: body.paragraphs ? { paragraphs: body.paragraphs } : {},
    ctaText: input.ctaText ?? null,
    style: style.primaryColor ? { primaryColor: style.primaryColor } : {},
  };
}

/**
 * Merge published/system content. Invalid stored overrides fail closed to system.
 */
export function mergeWithSystemDefaults(
  type: WorkspaceEmailTemplateType,
  override: EmailTemplateContentFields | null,
): EmailTemplateContentFields {
  const master = getMasterEmailTemplate(type);
  if (!master) return emptyContent();

  if (!override) {
    return {
      subject: master.defaults.subject,
      introText: master.defaults.introText,
      bodySections: {},
      ctaText: master.defaults.ctaText || null,
      style: {},
    };
  }

  const revalidated = validateWorkspaceEmailTemplateDraft(type, override);
  if (!revalidated.ok) {
    return {
      subject: master.defaults.subject,
      introText: master.defaults.introText,
      bodySections: {},
      ctaText: master.defaults.ctaText || null,
      style: {},
    };
  }

  return {
    subject: revalidated.value.subject ?? master.defaults.subject,
    introText: revalidated.value.introText ?? master.defaults.introText,
    bodySections: revalidated.value.bodySections,
    ctaText: revalidated.value.ctaText ?? (master.defaults.ctaText || null),
    style: revalidated.value.style,
  };
}

/**
 * Interpolate only whitelisted variables. Unknown tokens are removed (fail-safe).
 * Never reads arbitrary DB fields — values must be supplied by the caller.
 */
export function applyAllowedTemplateVariables(
  type: WorkspaceEmailTemplateType,
  text: string,
  values: Record<string, string | number | null | undefined>,
): string {
  const master = getMasterEmailTemplate(type);
  const allowed = new Set(master?.allowedVariables ?? []);
  return text.replace(VAR_RE, (_full, name: string) => {
    if (!allowed.has(name)) return "";
    const value = values[name];
    if (value == null) return "";
    return String(value);
  });
}
