import { openLeadHandoffHref } from "@/lib/agent/lead-profile-query";
import { SITE_URL } from "@/lib/constants";

export function smsAutomationLeadProfileUrl(leadId: string): string {
  const id = leadId.trim();
  if (!id) return "";
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}${openLeadHandoffHref(id)}`;
}
