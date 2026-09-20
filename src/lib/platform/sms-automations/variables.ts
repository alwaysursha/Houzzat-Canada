import {
  SMS_AUTOMATION_VARIABLES,
  type SmsAutomationVariable,
} from "./constants";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
const UNKNOWN_BRACES_RE = /\{\{|\}\}/;

export type SmsTemplateVariableIssue = {
  placeholder: string;
  reason: "unknown" | "not_allowed";
};

export function extractSmsTemplateVariables(body: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const name = match[1];
    if (name) found.add(name);
  }
  return [...found];
}

export function validateSmsTemplateBody(
  body: string,
  allowed: readonly string[],
): { ok: true } | { ok: false; issues: SmsTemplateVariableIssue[] } {
  const trimmed = body.trim();
  if (!trimmed) {
    return {
      ok: false,
      issues: [{ placeholder: "", reason: "unknown" }],
    };
  }

  const allowedSet = new Set(allowed);
  const known = new Set<string>(SMS_AUTOMATION_VARIABLES);
  const issues: SmsTemplateVariableIssue[] = [];
  const used = extractSmsTemplateVariables(body);

  for (const name of used) {
    if (!known.has(name)) {
      issues.push({ placeholder: name, reason: "unknown" });
    } else if (!allowedSet.has(name)) {
      issues.push({ placeholder: name, reason: "not_allowed" });
    }
  }

  const stripped = body.replace(PLACEHOLDER_RE, "");
  if (UNKNOWN_BRACES_RE.test(stripped)) {
    issues.push({ placeholder: "{{", reason: "unknown" });
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true };
}

export type SmsTemplatePreviewContext = Partial<
  Record<SmsAutomationVariable, string>
>;

export const SMS_TEMPLATE_PREVIEW_SAMPLES: Record<SmsAutomationVariable, string> =
  {
    firstName: "Jordan",
    leadName: "Jordan Customer",
    agentName: "Alex Agent",
    workspaceName: "Houzzat",
    propertyAddress: "123 King St W, Toronto",
    leadProfileUrl: "https://app.houzzatpro.com/agent/chats?lead=preview",
  };

export function renderSmsTemplate(
  body: string,
  context: SmsTemplatePreviewContext,
): string {
  return body.replace(PLACEHOLDER_RE, (_full, name: string) => {
    const value = context[name as SmsAutomationVariable];
    if (typeof value === "string" && value.trim()) return value.trim();
    return SMS_TEMPLATE_PREVIEW_SAMPLES[name as SmsAutomationVariable] ?? "";
  });
}
