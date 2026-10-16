/**
 * Phase 2D-1 — Admin Email Templates editor form ↔ sparse draft payload.
 *
 * Null/blank stored fields stay empty in the form. Registry defaults are shown
 * only as placeholders — they must never be written as tenant overrides unless
 * the admin explicitly types them.
 */

import type { EmailTemplateContentFields } from "@/lib/email/workspace-templates/types";

export type EmailTemplateEditorForm = {
  subject: string;
  introText: string;
  bodyParagraphs: string;
  ctaText: string;
  primaryColor: string;
};

export type EmailTemplateEditorDefaults = {
  subject: string;
  introText: string;
  ctaText: string;
};

export type EmailTemplateDraftPayload = {
  subject: string | null;
  introText: string | null;
  bodySections: { paragraphs: string[] } | null;
  ctaText: string | null;
  style: { primaryColor: string | null } | null;
};

export function emptyEmailTemplateEditorForm(): EmailTemplateEditorForm {
  return {
    subject: "",
    introText: "",
    bodyParagraphs: "",
    ctaText: "",
    primaryColor: "",
  };
}

/**
 * Load stored draft/published content into the editor.
 * Null fields stay blank — do not inject registry defaults into values.
 */
export function formFromStoredContent(
  content: EmailTemplateContentFields | null | undefined,
): EmailTemplateEditorForm {
  return {
    subject: content?.subject ?? "",
    introText: content?.introText ?? "",
    bodyParagraphs: (content?.bodySections.paragraphs ?? []).join("\n\n"),
    ctaText: content?.ctaText ?? "",
    primaryColor: content?.style.primaryColor ?? "",
  };
}

/**
 * Convert editor values to a sparse API payload.
 * Blank fields become null so live senders keep event-specific wording.
 */
export function formToDraftPayload(
  form: EmailTemplateEditorForm,
): EmailTemplateDraftPayload {
  const paragraphs = form.bodyParagraphs
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    subject: form.subject.trim() || null,
    introText: form.introText.trim() || null,
    bodySections: paragraphs.length ? { paragraphs } : null,
    ctaText: form.ctaText.trim() || null,
    style: form.primaryColor.trim()
      ? { primaryColor: form.primaryColor.trim() }
      : null,
  };
}

/** Sparse content for live-renderer preview (same null semantics as save/publish). */
export function contentFieldsFromForm(
  form: EmailTemplateEditorForm,
): EmailTemplateContentFields {
  const payload = formToDraftPayload(form);
  return {
    subject: payload.subject,
    introText: payload.introText,
    bodySections: payload.bodySections ?? {},
    ctaText: payload.ctaText,
    style: payload.style?.primaryColor
      ? { primaryColor: payload.style.primaryColor }
      : {},
  };
}
