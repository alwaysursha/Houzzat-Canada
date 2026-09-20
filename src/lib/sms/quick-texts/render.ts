import {
  extractSmsTemplateVariables,
  renderSmsTemplate,
  SMS_TEMPLATE_PREVIEW_SAMPLES,
  validateSmsTemplateBody,
  type SmsTemplatePreviewContext,
} from "@/lib/platform/sms-automations/variables";
import {
  SMS_QUICK_TEXT_VARIABLES,
  type SmsQuickTextVariable,
} from "./constants";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export type SmsQuickTextRenderContext = Partial<
  Record<SmsQuickTextVariable, string>
>;

export function validateSmsQuickTextBody(
  body: string,
  allowed: readonly string[] = SMS_QUICK_TEXT_VARIABLES,
) {
  return validateSmsTemplateBody(body, allowed);
}

export function renderSmsQuickText(
  body: string,
  context: SmsQuickTextRenderContext,
): string {
  return body
    .replace(PLACEHOLDER_RE, (_full, name: string) => {
      const value = context[name as SmsQuickTextVariable];
      return typeof value === "string" ? value.trim() : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function previewSmsQuickText(input: {
  body: string;
  allowedVariables?: readonly string[];
  context?: SmsTemplatePreviewContext;
}) {
  const allowed = input.allowedVariables ?? SMS_QUICK_TEXT_VARIABLES;
  const validation = validateSmsQuickTextBody(input.body, allowed);
  return {
    rendered: renderSmsTemplate(input.body, {
      ...SMS_TEMPLATE_PREVIEW_SAMPLES,
      ...input.context,
    }),
    valid: validation.ok,
    issues: validation.ok ? [] : validation.issues,
    usedVariables: extractSmsTemplateVariables(input.body),
  };
}

export function firstNameFromLeadName(
  leadName: string | null | undefined,
): string {
  const trimmed = leadName?.trim() || "";
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}
